import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  listCourseRoster,
  mutateCourseRoster,
} from "@/services/course-rosters/service";
import { claimStudentAccount } from "@/services/auth/registration";
import { registerSchema } from "@/services/auth/schemas";

async function main() {
  assert.match(
    new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") ?? "",
    /^teaching_it_[a-z0-9_]+$/,
  );
  const teacher = await prisma.user.findUniqueOrThrow({
      where: { email: "teacher@example.com" },
    }),
    student = await prisma.user.findUniqueOrThrow({
      where: { email: "student@example.com" },
    });
  const other = await prisma.user.create({
    data: {
      email: `other-${randomUUID()}@example.invalid`,
      passwordHash: teacher.passwordHash,
      role: "TEACHER",
    },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      questionCategory: {
        connectOrCreate: {
          where: { normalizedName: "automated-test-category" },
          create: {
            name: "自动化测试课程分类",
            normalizedName: "automated-test-category",
          },
        },
      },
      teacher: { connect: { id: teacher.id } },
      template: { connect: { id: template.id } },
      courseNo: "ROSTER-TEST",
      term: "TEST",
      name: "名单维护测试",
      status: "ACTIVE",
    },
  });
  const first = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "名单一班",
      joinCode: randomUUID(),
    },
  });
  const second = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "名单二班",
      joinCode: randomUUID(),
    },
  });
  const add = {
    action: "ADD",
    classroomId: first.id,
    studentNo: "ROSTER001",
    name: "名单测试学生",
  };
  await mutateCourseRoster(teacher.id, course.id, add);
  await mutateCourseRoster(teacher.id, course.id, add);
  const list = await listCourseRoster(teacher.id, course.id, {
    status: "PENDING",
  });
  assert.equal(list.total, 1);
  let row = list.items[0];
  assert.ok(row && "identityUpdatedAt" in row);
  await assert.rejects(() => mutateCourseRoster(other.id, course.id, add));
  await assert.rejects(() => listCourseRoster(student.id, course.id, {}));
  await assert.rejects(() =>
    listCourseRoster(teacher.id, course.id, {
      classroomId: "cmissing000000000000000000",
    }),
  );
  await mutateCourseRoster(teacher.id, course.id, {
    action: "EDIT",
    assignmentId: row.id,
    expectedUpdatedAt: row.identityUpdatedAt,
    studentNo: "ROSTER002",
    name: "名单纠正学生",
  });
  await assert.rejects(() =>
    mutateCourseRoster(teacher.id, course.id, {
      action: "EDIT",
      assignmentId: row.id,
      expectedUpdatedAt: row.identityUpdatedAt,
      studentNo: "ROSTER003",
      name: "过期修改学生",
    }),
  );
  await mutateCourseRoster(teacher.id, course.id, {
    ...add,
    studentNo: "ROSTER002",
    name: "名单纠正学生",
    classroomId: second.id,
  });
  row = (
    await listCourseRoster(teacher.id, course.id, { classroomId: first.id })
  ).items[0];
  await mutateCourseRoster(teacher.id, course.id, {
    action: "REMOVE",
    kind: "PENDING",
    id: row.id,
    expectedUpdatedAt: row.updatedAt,
  });
  assert.equal(
    (await listCourseRoster(teacher.id, course.id, { classroomId: first.id }))
      .total,
    0,
  );
  const removed = (
    await listCourseRoster(teacher.id, course.id, {
      classroomId: first.id,
      status: "REMOVED",
    })
  ).items[0];
  await mutateCourseRoster(teacher.id, course.id, {
    action: "RESTORE",
    kind: "PENDING",
    id: removed.id,
    expectedUpdatedAt: removed.updatedAt,
  });
  row = (
    await listCourseRoster(teacher.id, course.id, { classroomId: first.id })
  ).items[0];
  await mutateCourseRoster(teacher.id, course.id, {
    action: "REMOVE",
    kind: "PENDING",
    id: row.id,
    expectedUpdatedAt: row.updatedAt,
  });
  await prisma.systemConfig.update({
    where: { singletonKey: "default" },
    data: { allowSelfRegistration: true },
  });
  const claimed = await claimStudentAccount(
    registerSchema.parse({
      studentNo: "ROSTER002",
      displayName: "名单纠正学生",
      email: `claim-${randomUUID()}@example.invalid`,
      password: "Student123!",
      confirmPassword: "Student123!",
    }),
  );
  assert.equal(
    await prisma.classMembership.count({
      where: { studentId: claimed.id, classroomId: first.id, status: "ACTIVE" },
    }),
    0,
  );
  assert.equal(
    await prisma.classMembership.count({
      where: {
        studentId: claimed.id,
        classroomId: second.id,
        status: "ACTIVE",
      },
    }),
    1,
  );
  const member = (
    await listCourseRoster(teacher.id, course.id, { classroomId: second.id })
  ).items[0];
  assert.equal(member.kind, "MEMBER");
  await mutateCourseRoster(teacher.id, course.id, {
    action: "EDIT_MEMBER",
    membershipId: member.id,
    expectedUpdatedAt: member.identityUpdatedAt,
    name: "姓名纠正学生",
  });
  assert.equal(
    (
      await prisma.userProfile.findUniqueOrThrow({
        where: { userId: claimed.id },
      })
    ).studentNo,
    "ROSTER002",
  );
  await assert.rejects(() =>
    mutateCourseRoster(teacher.id, course.id, {
      action: "EDIT",
      assignmentId: row.id,
      expectedUpdatedAt: row.identityUpdatedAt,
      studentNo: "ROSTER004",
      name: "已认领不能改",
    }),
  );
  await mutateCourseRoster(teacher.id, course.id, {
    action: "REMOVE",
    kind: "MEMBER",
    id: member.id,
    expectedUpdatedAt: member.updatedAt,
  });
  const gone = (
    await listCourseRoster(teacher.id, course.id, {
      classroomId: second.id,
      status: "REMOVED",
    })
  ).items[0];
  await mutateCourseRoster(teacher.id, course.id, {
    action: "RESTORE",
    kind: "MEMBER",
    id: gone.id,
    expectedUpdatedAt: gone.updatedAt,
  });
  assert.ok(await prisma.user.findUnique({ where: { id: claimed.id } }));
  const foreign = await prisma.classroom.create({
    data: { teacherId: other.id, name: "其他教师班级", joinCode: randomUUID() },
  });
  await prisma.classMembership.create({
    data: { classroomId: foreign.id, studentId: claimed.id },
  });
  const shared = (
    await listCourseRoster(teacher.id, course.id, { classroomId: second.id })
  ).items[0];
  assert.equal(shared.canEdit, false);
  await assert.rejects(() =>
    mutateCourseRoster(teacher.id, course.id, {
      action: "EDIT_MEMBER",
      membershipId: shared.id,
      expectedUpdatedAt: shared.identityUpdatedAt,
      name: "不得跨教师修改",
    }),
  );
  assert.ok(
    (await prisma.auditLog.count({
      where: {
        actorId: teacher.id,
        targetId: course.id,
        action: "COURSE_ROSTER_UPDATED",
      },
    })) > 0,
  );
  await assert.rejects(() =>
    mutateCourseRoster(teacher.id, course.id, {
      ...add,
      classroomId: foreign.id,
    }),
  );
  console.log(
    "PASS roster maintenance: add and duplicate requests, pending corrections, stale updates, withdrawn registration isolation, member name correction, retained student identity, remove/restore, ownership and shared-account isolation, audit history",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
