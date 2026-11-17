import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  AnnouncementTargetType,
  AssignmentStatus,
  MembershipStatus,
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  Role,
  SubmissionStatus,
  UserStatus,
} from "@prisma/client";

import { prisma } from "../../../lib/prisma";
import {
  createAnnouncement,
  publishAnnouncement,
} from "../../../services/announcements/service";
import { ResourceNotFoundError } from "../../../services/auth/policy";
import {
  getTeacherTeachingPreferences,
  setTeacherTeachingPreferences,
} from "../../../services/dashboard/teacher-settings";
import { notifyAssignmentGraded } from "../../../services/notifications/events/assignment";
import { runAssignmentDueReminders } from "../../../services/notifications/reminders";
import {
  createNotification,
  getUnreadNotificationCount,
  getUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../../services/notifications/service";
import { integrationPrisma } from "../recommendations/database";
import { deliverQualityReportNotifications } from "../../../services/quality-reports/notifications";

test("teacher preferences mute report review notifications and preserve failure delivery", async (t) => {
  const tag = randomUUID();
  const teacher = await integrationPrisma.user.create({
    data: {
      email: `${tag}@example.test`,
      role: Role.TEACHER,
      passwordHash: "integration-test-only",
    },
  });
  const template = await integrationPrisma.courseTemplate.create({
    data: { code: tag, name: tag },
  });
  const category = await integrationPrisma.questionCourseCategory.create({
    data: { name: tag, normalizedName: tag },
  });
  const course = await integrationPrisma.course.create({
    data: {
      teacherId: teacher.id,
      name: tag,
      courseNo: tag,
      term: "2026-2027-1",
      templateId: template.id,
      questionCategoryId: category.id,
    },
  });
  t.after(async () => {
    await integrationPrisma.notification.deleteMany({
      where: { recipientId: teacher.id },
    });
    await integrationPrisma.courseQualityReport.deleteMany({
      where: { courseId: course.id },
    });
    await integrationPrisma.course.delete({ where: { id: course.id } });
    await integrationPrisma.courseTemplate.delete({
      where: { id: template.id },
    });
    await integrationPrisma.questionCourseCategory.delete({
      where: { id: category.id },
    });
    await integrationPrisma.user.delete({ where: { id: teacher.id } });
  });

  const createReport = (
    versionNumber: number,
    status: "SUCCEEDED" | "FAILED",
  ) =>
    integrationPrisma.courseQualityReport.create({
      data: {
        courseId: course.id,
        requestedById: teacher.id,
        versionNumber,
        sourceType: "UPLOAD",
        sourceSnapshotJson: {},
        inputFingerprint: String(versionNumber).padStart(64, "0"),
        calculationRuleVersion: "test",
        promptVersion: "test",
        templateVersion: "test",
        templateChecksumSha256: "a".repeat(64),
        completedAt: new Date(),
        notificationPending: true,
        status,
      },
    });
  const savedDefaults = await getTeacherTeachingPreferences(teacher.id);
  assert.deepEqual(savedDefaults, {
    assignmentDueDays: null,
    allowAssignmentResubmission: false,
    notifyQualityReportReady: true,
  });
  const initialSuccess = await createReport(1, "SUCCEEDED");
  await deliverQualityReportNotifications();

  const muted = {
    assignmentDueDays: 14,
    allowAssignmentResubmission: true,
    notifyQualityReportReady: false,
  };
  await setTeacherTeachingPreferences(teacher.id, muted);
  assert.deepEqual(await getTeacherTeachingPreferences(teacher.id), muted);
  const mutedSuccess = await createReport(2, "SUCCEEDED");
  const failure = await createReport(3, "FAILED");
  await deliverQualityReportNotifications();

  await setTeacherTeachingPreferences(teacher.id, savedDefaults);
  const newSuccess = await createReport(4, "SUCCEEDED");
  await deliverQualityReportNotifications();
  await deliverQualityReportNotifications();

  const notices = await integrationPrisma.notification.findMany({
    where: {
      recipientId: teacher.id,
      type: NotificationType.QUALITY_REPORT_RESULT,
    },
    select: { sourceId: true, priority: true },
  });
  assert.equal(notices.length, 3);
  assert.deepEqual(
    new Map(notices.map(({ sourceId, priority }) => [sourceId, priority])),
    new Map([
      [initialSuccess.id, NotificationPriority.NORMAL],
      [failure.id, NotificationPriority.IMPORTANT],
      [newSuccess.id, NotificationPriority.NORMAL],
    ]),
  );
  assert.equal(
    (
      await integrationPrisma.courseQualityReport.findUniqueOrThrow({
        where: { id: mutedSuccess.id },
      })
    ).notificationPending,
    false,
  );
});

test("PostgreSQL notification workflow enforces ownership, expiry, role targeting and idempotency", async (t) => {
  const suffix = randomUUID().replaceAll("-", "");
  const school = await integrationPrisma.school.create({
    data: { name: `Notification school ${suffix}`, key: `n${suffix}` },
  });
  const users = await Promise.all(
    [
      [Role.ADMIN, UserStatus.ACTIVE, "Admin"],
      [Role.TEACHER, UserStatus.ACTIVE, "Teacher"],
      [Role.STUDENT, UserStatus.ACTIVE, "Student"],
      [Role.STUDENT, UserStatus.ACTIVE, "Submitted"],
      [Role.STUDENT, UserStatus.INACTIVE, "Inactive"],
    ].map(async ([role, status, label], index) =>
      integrationPrisma.user.create({
        data: {
          email: `notification_${index}_${suffix}@example.test`,
          passwordHash: "integration-test-only",
          schoolId: school.id,
          role: role as Role,
          status: status as UserStatus,
          profile: { create: { displayName: `${label}-${suffix}` } },
        },
      }),
    ),
  );
  const [admin, teacher, student, submittedStudent, inactiveStudent] = users;
  const classroom = await integrationPrisma.classroom.create({
    data: {
      teacherId: teacher.id,
      name: `Notification classroom ${suffix}`,
      joinCode: `N${suffix.slice(0, 7).toUpperCase()}`,
      memberships: {
        create: [student, submittedStudent, inactiveStudent].map((member) => ({
          studentId: member.id,
          status: MembershipStatus.ACTIVE,
        })),
      },
    },
  });
  const now = new Date("2026-07-22T08:00:00.000Z");
  const assignment = await integrationPrisma.assignment.create({
    data: {
      classroomId: classroom.id,
      teacherId: teacher.id,
      title: `Due assignment ${suffix}`,
      status: AssignmentStatus.PUBLISHED,
      publishedAt: new Date(now.getTime() - 60_000),
      dueAt: new Date(now.getTime() + 12 * 60 * 60 * 1_000),
    },
  });
  const submission = await integrationPrisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: submittedStudent.id,
      idempotencyKey: `notification-${suffix}`,
      status: SubmissionStatus.GRADED,
      startedAt: new Date(now.getTime() - 60_000),
      submittedAt: now,
      gradedAt: now,
    },
  });

  t.after(async () => {
    const userIds = users.map((user) => user.id);
    await integrationPrisma.notification.deleteMany({
      where: { recipientId: { in: userIds } },
    });
    await integrationPrisma.auditLog.deleteMany({
      where: { actorId: { in: userIds } },
    });
    await integrationPrisma.announcement.deleteMany({
      where: { createdById: { in: userIds } },
    });
    await integrationPrisma.notificationJobRun.deleteMany();
    await integrationPrisma.submission.deleteMany({
      where: { assignmentId: assignment.id },
    });
    await integrationPrisma.assignment.delete({ where: { id: assignment.id } });
    await integrationPrisma.classMembership.deleteMany({
      where: { classroomId: classroom.id },
    });
    await integrationPrisma.classroom.delete({ where: { id: classroom.id } });
    await integrationPrisma.userProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    await integrationPrisma.user.deleteMany({ where: { id: { in: userIds } } });
    await integrationPrisma.school.delete({ where: { id: school.id } });
  });

  const firstRun = await runAssignmentDueReminders(now);
  assert.equal(firstRun.scannedCount, 1);
  assert.equal(firstRun.createdCount, 1);
  assert.equal(firstRun.failedCount, 0);
  const secondRun = await runAssignmentDueReminders(now);
  assert.equal(secondRun.createdCount, 0);
  assert.equal(
    await integrationPrisma.notification.count({
      where: { type: NotificationType.ASSIGNMENT_DUE_SOON },
    }),
    1,
  );
  assert.equal(
    await integrationPrisma.notification.count({
      where: { recipientId: submittedStudent.id },
    }),
    0,
  );
  assert.equal(
    await integrationPrisma.notification.count({
      where: { recipientId: inactiveStudent.id },
    }),
    0,
  );

  await notifyAssignmentGraded({
    recipientId: student.id,
    submissionId: submission.id,
    assignmentTitle: assignment.title,
  });
  await notifyAssignmentGraded({
    recipientId: student.id,
    submissionId: submission.id,
    assignmentTitle: assignment.title,
  });
  assert.equal(
    await integrationPrisma.notification.count({
      where: {
        recipientId: student.id,
        type: NotificationType.ASSIGNMENT_GRADED,
      },
    }),
    1,
  );

  const announcement = await createAnnouncement(
    admin.id,
    {
      title: "Teacher announcement",
      content: "This is stored and rendered as plain text: <script>x</script>",
      targetType: AnnouncementTargetType.TEACHER,
      expiresAt: null,
    },
    { ipAddress: null, userAgent: "notification-integration" },
    now,
  );
  const published = await publishAnnouncement(
    admin.id,
    announcement.id,
    { ipAddress: null, userAgent: "notification-integration" },
    now,
  );
  assert.equal(published.createdNotificationCount, 1);
  const repeatedPublish = await publishAnnouncement(
    admin.id,
    announcement.id,
    { ipAddress: null, userAgent: "notification-integration" },
    now,
  );
  assert.equal(repeatedPublish.alreadyPublished, true);
  assert.equal(repeatedPublish.createdNotificationCount, 0);
  const teacherNotification =
    await integrationPrisma.notification.findFirstOrThrow({
      where: {
        recipientId: teacher.id,
        type: NotificationType.SYSTEM_ANNOUNCEMENT,
      },
    });
  await assert.rejects(
    markNotificationRead(student.id, teacherNotification.id, now),
    ResourceNotFoundError,
  );
  assert.equal(
    await integrationPrisma.auditLog.count({
      where: { targetId: announcement.id, action: "ANNOUNCEMENT_PUBLISHED" },
    }),
    1,
  );

  await createNotification({
    recipientId: student.id,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: "Expired",
    content: "Expired notification",
    priority: NotificationPriority.NORMAL,
    actionUrl: "/notifications",
    sourceType: NotificationSourceType.ANNOUNCEMENT,
    sourceId: announcement.id,
    deduplicationKey: `expired:${announcement.id}`,
    expiresAt: new Date(now.getTime() - 1_000),
  });
  const list = await getUserNotifications(
    student.id,
    { page: 1, pageSize: 20 },
    now,
  );
  assert.equal(
    list.items.some((item) => item.title === "Expired"),
    false,
  );
  assert.equal("deduplicationKey" in list.items[0], false);
  const unreadBefore = await getUnreadNotificationCount(student.id, now);
  assert.equal(unreadBefore, 2);
  const own = list.items[0];
  const marked = await markNotificationRead(student.id, own.id, now);
  assert.equal(marked.readAt.getTime(), now.getTime());
  const markedAgain = await markNotificationRead(
    student.id,
    own.id,
    new Date(now.getTime() + 5_000),
  );
  assert.equal(markedAgain.readAt.getTime(), now.getTime());
  const allRead = await markAllNotificationsRead(student.id, now);
  assert.equal(allRead.updatedCount, 1);
  assert.equal(await getUnreadNotificationCount(student.id, now), 0);
});

test.after(async () => {
  await Promise.all([integrationPrisma.$disconnect(), prisma.$disconnect()]);
});
