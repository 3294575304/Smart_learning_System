import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { CourseStatus, PrismaClient } from "@prisma/client";

import { createCourseClassroom } from "@/services/courses/classroom-creation";
import { assertIsolatedIntegrationEnvironment } from "@/tests/integration/database";

assertIsolatedIntegrationEnvironment("COURSE_CLASSROOM_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();
const auditContext = {
  ipAddress: "127.0.0.1",
  userAgent: "classroom-integration",
};

test("课程内建班原子绑定、权限、同名冲突、并发与审计", async () => {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
    select: { id: true },
  });
  const otherTeacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher2@example.com" },
    select: { id: true },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow({
    where: { isActive: true },
    select: { id: true },
  });
  const category = await prisma.questionCourseCategory.findFirstOrThrow({
    where: { isActive: true },
    select: { id: true },
  });
  const course = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      templateId: template.id,
      questionCategoryId: category.id,
      courseNo: `IT-CLASS-${randomBytes(4).toString("hex")}`,
      term: "2026-2027-1",
      name: "课程班级集成测试",
      status: CourseStatus.ACTIVE,
    },
    select: { id: true },
  });

  try {
    await assert.rejects(
      createCourseClassroom(
        otherTeacher.id,
        course.id,
        {
          name: "跨教师班级",
          description: null,
          allowStudentLeave: true,
        },
        auditContext,
      ),
      /课程不存在/u,
    );
    const firstInput = {
      name: "Python 一班",
      description: "集成测试",
      allowStudentLeave: true,
    };
    const first = await createCourseClassroom(
      teacher.id,
      course.id,
      firstInput,
      auditContext,
    );
    const saved = await prisma.classroom.findUniqueOrThrow({
      where: { id: first.id },
      select: {
        courseId: true,
        teacherId: true,
        allowStudentLeave: true,
        joinCode: true,
      },
    });
    assert.equal(saved.courseId, course.id);
    assert.equal(saved.teacherId, teacher.id);
    assert.equal(saved.allowStudentLeave, true);
    assert.ok(saved.joinCode);
    await assert.rejects(
      createCourseClassroom(teacher.id, course.id, firstInput, auditContext),
      /同名班级/u,
    );

    const concurrent = await Promise.allSettled([
      createCourseClassroom(
        teacher.id,
        course.id,
        { ...firstInput, name: "Python 二班" },
        auditContext,
      ),
      createCourseClassroom(
        teacher.id,
        course.id,
        { ...firstInput, name: "Python 二班" },
        auditContext,
      ),
    ]);
    assert.equal(
      concurrent.filter((item) => item.status === "fulfilled").length,
      1,
    );
    assert.equal(
      concurrent.filter((item) => item.status === "rejected").length,
      1,
    );
    assert.equal(
      await prisma.classroom.count({
        where: { courseId: course.id, name: "Python 二班" },
      }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { targetId: first.id, action: "COURSE_CLASSROOM_LINKED" },
      }),
      1,
    );

    await prisma.course.update({
      where: { id: course.id },
      data: { status: CourseStatus.ARCHIVED },
    });
    await assert.rejects(
      createCourseClassroom(
        teacher.id,
        course.id,
        { ...firstInput, name: "归档后班级" },
        auditContext,
      ),
      /课程状态/u,
    );
  } finally {
    const ids = (
      await prisma.classroom.findMany({
        where: { courseId: course.id },
        select: { id: true },
      })
    ).map((item) => item.id);
    await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } });
    await prisma.classroom.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.$disconnect();
  }
});
