import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test, { after } from "node:test";

import { prisma } from "@/lib/prisma";
import {
  createTeacherAttendanceSession,
  getStudentAttendanceSession,
  updateTeacherAttendanceSession,
} from "@/services/attendance/service";
import { getUserNotifications } from "@/services/notifications/service";
import { notifyAttendancePublished } from "@/services/notifications/events/attendance";
import { ensureTestQuestionCategory } from "@/tests/helpers/question-course-category";

after(async () => {
  await prisma.$disconnect();
});

test("签到发布仅通知本班有效学生，开放去重，取消和退班后的跳转重新验证归属", async () => {
  const suffix = randomBytes(5).toString("hex");
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow({
    where: { code: "python-programming-v1" },
  });
  const category = await ensureTestQuestionCategory(prisma, teacher.id);
  const [inactive, removed, outsider] = await Promise.all(
    ["inactive", "removed", "outsider"].map((kind) =>
      prisma.user.create({
        data: {
          email: `attendance-${kind}-${suffix}@example.com`,
          passwordHash: student.passwordHash,
          role: "STUDENT",
          status: kind === "inactive" ? "INACTIVE" : "ACTIVE",
          schoolId: student.schoolId,
        },
      }),
    ),
  );
  const course = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      templateId: template.id,
      questionCategoryId: category.id,
      courseNo: `ATTEND-${suffix}`,
      term: "2026-2027-1",
      name: "签到通知测试课程",
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "签到通知测试班",
      joinCode: suffix,
      memberships: {
        create: [
          { studentId: student.id },
          { studentId: inactive.id },
          { studentId: removed.id, status: "REMOVED", endedAt: new Date() },
        ],
      },
    },
  });
  const now = new Date();
  const input = {
    classroomId: classroom.id,
    title: "第1次签到",
    startsAt: now,
    signInOpensAt: new Date(now.getTime() - 60_000),
    lateAfter: new Date(now.getTime() + 60_000),
    signInClosesAt: new Date(now.getTime() + 600_000),
  };
  const context = {
    ipAddress: "127.0.0.1",
    userAgent: "attendance-notification-test",
  };
  const session = await createTeacherAttendanceSession(
    teacher.id,
    course.id,
    input,
    context,
  );
  const notices = await prisma.notification.findMany({
    where: { sourceType: "ATTENDANCE_SESSION", sourceId: session.id },
  });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].recipientId, student.id);
  assert.equal(notices[0].type, "ATTENDANCE_PUBLISHED");
  assert.match(notices[0].content, /签到通知测试班/u);
  assert.ok(notices[0].actionUrl?.includes(`classroomId=${classroom.id}`));
  assert.ok(
    notices[0].actionUrl?.startsWith(`/student/attendance/${session.id}?`),
  );
  const ownRecord = await getStudentAttendanceSession(student.id, session.id);
  assert.equal(ownRecord.session.id, session.id);
  assert.equal("challengeHash" in ownRecord.session, false);
  assert.equal("locationLatitude" in ownRecord.session, false);
  await assert.rejects(
    getStudentAttendanceSession(outsider.id, session.id),
    /签到场次不存在/u,
  );
  const query = {
    page: 1,
    pageSize: 20,
    type: "ATTENDANCE_PUBLISHED" as const,
  };
  const scheduled = await getUserNotifications(student.id, query);
  assert.equal(
    scheduled.items.find((item) => item.sourceId === session.id)?.action?.label,
    "查看签到记录",
  );
  const opened = await updateTeacherAttendanceSession(
    teacher.id,
    session.id,
    { action: "OPEN", expectedRevision: session.revision },
    context,
    now,
  );
  assert.equal(
    await prisma.notification.count({ where: { sourceId: session.id } }),
    1,
  );
  const available = await getUserNotifications(student.id, query, now);
  const attendanceAction = available.items.find(
    (item) => item.sourceId === session.id,
  )?.action;
  assert.ok(attendanceAction?.kind === "LINK");
  assert.ok(
    attendanceAction.href.startsWith(`/student/attendance/${session.id}?`),
  );
  assert.equal(
    available.items.find((item) => item.sourceId === session.id)?.action?.label,
    "前往签到",
  );
  assert.equal(
    (await getUserNotifications(outsider.id, query)).items.length,
    0,
  );
  await prisma.classMembership.update({
    where: {
      classroomId_studentId: {
        classroomId: classroom.id,
        studentId: student.id,
      },
    },
    data: { status: "REMOVED", endedAt: new Date() },
  });
  await assert.rejects(
    getStudentAttendanceSession(student.id, session.id),
    /签到场次不存在/u,
  );
  assert.equal(
    (await getUserNotifications(student.id, query)).items.find(
      (item) => item.sourceId === session.id,
    )?.action,
    null,
  );
  await prisma.classMembership.update({
    where: {
      classroomId_studentId: {
        classroomId: classroom.id,
        studentId: student.id,
      },
    },
    data: { status: "ACTIVE", endedAt: null },
  });
  await updateTeacherAttendanceSession(
    teacher.id,
    session.id,
    { action: "CANCEL", expectedRevision: opened.revision },
    context,
    now,
  );
  const cancelled = (await getUserNotifications(student.id, query)).items.find(
    (item) => item.sourceId === session.id,
  );
  assert.equal(cancelled?.action, null);
  assert.match(cancelled?.actionMessage ?? "", /取消/u);

  const sessionCount = await prisma.attendanceSession.count({
    where: { courseId: course.id },
  });
  await assert.rejects(
    createTeacherAttendanceSession(outsider.id, course.id, input, context),
  );
  await assert.rejects(
    createTeacherAttendanceSession(
      teacher.id,
      course.id,
      { ...input, signInMethod: "CODE" },
      context,
    ),
  );
  assert.equal(
    await prisma.attendanceSession.count({ where: { courseId: course.id } }),
    sessionCount,
  );

  const rollbackSource = `rollback-${suffix}`;
  await assert.rejects(
    prisma.$transaction(async (transaction) => {
      await notifyAttendancePublished(
        {
          sessionId: rollbackSource,
          courseId: course.id,
          classroomId: classroom.id,
          courseName: course.name,
          classroomName: classroom.name,
          title: "回滚验证",
          opensAt: input.signInOpensAt,
          closesAt: input.signInClosesAt,
          recipientIds: [student.id],
        },
        transaction,
      );
      throw new Error("rollback notification transaction");
    }),
    /rollback notification transaction/u,
  );
  assert.equal(
    await prisma.notification.count({ where: { sourceId: rollbackSource } }),
    0,
  );
});
