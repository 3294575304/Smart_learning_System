import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { AuditAction, PrismaClient } from "@prisma/client";

import { dissolveTeacherClassroom } from "@/services/classrooms/service";

const prisma = new PrismaClient();
const auditContext = { ipAddress: "127.0.0.1", userAgent: "test" };

test("教师解散只有成员的班级并保留账号、其他班级关系和课程", async () => {
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
    },
  });
  const result = await dissolveTeacherClassroom(
    teacher.id,
    classroom.id,
    auditContext,
    {
      storage: {
        save: async () => undefined,
        read: async () => Buffer.alloc(0),
        delete: async () => undefined,
      },
    },
  );
  assert.equal(result.releasedStudentCount, 1);
  assert.equal(
    await prisma.classroom.count({ where: { id: classroom.id } }),
    0,
  );
  assert.equal(
    await prisma.classMembership.count({
      where: { classroomId: classroom.id },
    }),
    0,
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
  await prisma.auditLog.delete({ where: { id: audit.id } });
  await prisma.classMembership.delete({
    where: {
      classroomId_studentId: { classroomId: other.id, studentId: student.id },
    },
  });
  await prisma.classroom.delete({ where: { id: other.id } });
  await prisma.course.delete({ where: { id: course.id } });
});

test("正式教学数据阻止解散且审计异常会回滚", async () => {
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const protectedClassroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      name: "正式数据班级",
      joinCode: `FORM${suffix}`,
      assignments: { create: { teacherId: teacher.id, title: "已有作业" } },
    },
  });
  await assert.rejects(
    () =>
      dissolveTeacherClassroom(teacher.id, protectedClassroom.id, auditContext),
    /已经产生作业/u,
  );
  assert.equal(
    await prisma.classroom.count({ where: { id: protectedClassroom.id } }),
    1,
  );
  const rollbackClassroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      name: "回滚班级",
      joinCode: `ROLL${suffix}`,
    },
  });
  await assert.rejects(
    () =>
      dissolveTeacherClassroom(teacher.id, rollbackClassroom.id, auditContext, {
        writeAuditLog: async () => {
          throw new Error("simulated audit failure");
        },
        storage: {
          save: async () => undefined,
          read: async () => Buffer.alloc(0),
          delete: async () => undefined,
        },
      }),
    /simulated audit failure/u,
  );
  assert.equal(
    await prisma.classroom.count({ where: { id: rollbackClassroom.id } }),
    1,
  );
  await prisma.assignment.deleteMany({
    where: { classroomId: protectedClassroom.id },
  });
  await prisma.classroom.delete({ where: { id: protectedClassroom.id } });
  await prisma.classroom.delete({ where: { id: rollbackClassroom.id } });
});
