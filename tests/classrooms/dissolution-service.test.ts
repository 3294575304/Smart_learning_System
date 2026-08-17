import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  AssignmentStatus,
  AuditAction,
  ClassroomStatus,
  MembershipStatus,
  NotificationType,
  PrismaClient,
} from "@prisma/client";

import { dissolveTeacherClassroom } from "@/services/classrooms/service";

const prisma = new PrismaClient();
const auditContext = { ipAddress: "127.0.0.1", userAgent: "test" };

test("教师可解散已有学生和已发布作业的班级并通知学生、保留历史数据", async () => {
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  const [teacher, student, template] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: "teacher@example.com" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "student@example.com" } }),
    prisma.courseTemplate.findFirstOrThrow({
      where: { code: "python-programming-v1" },
    }),
  ]);
  const course = await prisma.course.create({
    data: {
      templateId: template.id,
      teacherId: teacher.id,
      courseNo: `DISSOLVE-${suffix}`,
      term: "2026-2027-1",
      name: "解散测试课程",
    },
  });
  const other = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      name: "保留班级",
      joinCode: `KEEP${suffix}`,
      memberships: { create: { studentId: student.id } },
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "待解散班级",
      joinCode: `DROP${suffix}`,
      memberships: { create: { studentId: student.id } },
      assignments: {
        create: {
          teacherId: teacher.id,
          title: "已发布历史作业",
          status: AssignmentStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      },
    },
  });
  const reason = "本学期教学已经结束";
  const result = await dissolveTeacherClassroom(
    teacher.id,
    classroom.id,
    { reason },
    auditContext,
  );
  assert.equal(result.releasedStudentCount, 1);
  assert.equal(result.notifiedStudentCount, 1);
  const dissolved = await prisma.classroom.findUniqueOrThrow({
    where: { id: classroom.id },
  });
  assert.equal(dissolved.status, ClassroomStatus.ARCHIVED);
  assert.equal(dissolved.dissolutionReason, reason);
  assert.ok(dissolved.dissolvedAt);
  assert.equal(
    (
      await prisma.classMembership.findUniqueOrThrow({
        where: {
          classroomId_studentId: {
            classroomId: classroom.id,
            studentId: student.id,
          },
        },
      })
    ).status,
    MembershipStatus.REMOVED,
  );
  assert.equal(
    await prisma.assignment.count({ where: { classroomId: classroom.id } }),
    1,
  );
  assert.equal(await prisma.user.count({ where: { id: student.id } }), 1);
  assert.equal(
    await prisma.classMembership.count({
      where: { classroomId: other.id, studentId: student.id },
    }),
    1,
  );
  assert.equal(await prisma.course.count({ where: { id: course.id } }), 1);
  const audit = await prisma.auditLog.findFirstOrThrow({
    where: { action: AuditAction.CLASSROOM_DISSOLVED, targetId: classroom.id },
  });
  assert.equal((audit.beforeData as { memberCount?: number }).memberCount, 1);
  assert.equal(
    (audit.afterData as { dissolutionReason?: string }).dissolutionReason,
    reason,
  );
  const notification = await prisma.notification.findFirstOrThrow({
    where: {
      recipientId: student.id,
      type: NotificationType.CLASSROOM_DISSOLVED,
      sourceId: classroom.id,
    },
  });
  assert.match(notification.content, /本学期教学已经结束/u);
  await prisma.notification.delete({ where: { id: notification.id } });
  await prisma.auditLog.delete({ where: { id: audit.id } });
  await prisma.assignment.deleteMany({ where: { classroomId: classroom.id } });
  await prisma.classMembership.deleteMany({
    where: { classroomId: classroom.id },
  });
  await prisma.classroom.delete({ where: { id: classroom.id } });
  await prisma.classMembership.delete({
    where: {
      classroomId_studentId: { classroomId: other.id, studentId: student.id },
    },
  });
  await prisma.classroom.delete({ where: { id: other.id } });
  await prisma.course.delete({ where: { id: course.id } });
});

test("审计异常会回滚班级状态、成员移除和学生通知", async () => {
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const rollbackClassroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      name: "回滚班级",
      joinCode: `ROLL${suffix}`,
      memberships: { create: { studentId: student.id } },
    },
  });
  await assert.rejects(
    () =>
      dissolveTeacherClassroom(
        teacher.id,
        rollbackClassroom.id,
        { reason: "测试事务回滚" },
        auditContext,
        {
          writeAuditLog: async () => {
            throw new Error("simulated audit failure");
          },
        },
      ),
    /simulated audit failure/u,
  );
  const rolledBack = await prisma.classroom.findUniqueOrThrow({
    where: { id: rollbackClassroom.id },
  });
  assert.equal(rolledBack.status, ClassroomStatus.ACTIVE);
  assert.equal(rolledBack.dissolvedAt, null);
  assert.equal(
    (
      await prisma.classMembership.findUniqueOrThrow({
        where: {
          classroomId_studentId: {
            classroomId: rollbackClassroom.id,
            studentId: student.id,
          },
        },
      })
    ).status,
    MembershipStatus.ACTIVE,
  );
  assert.equal(
    await prisma.notification.count({
      where: {
        type: NotificationType.CLASSROOM_DISSOLVED,
        sourceId: rollbackClassroom.id,
      },
    }),
    0,
  );
  await prisma.classMembership.deleteMany({
    where: { classroomId: rollbackClassroom.id },
  });
  await prisma.classroom.delete({ where: { id: rollbackClassroom.id } });
});
