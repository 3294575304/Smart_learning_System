import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  ClassroomStatus,
  CourseStatus,
  PrismaClient,
} from "@prisma/client";

import { createAdminCourseTemplate, createTeacherCourse, getTeacherCourse, linkTeacherClassroomToCourse, listTeacherCourseTemplates, setAdminCourseTemplateActive, updateAdminCourseTemplate, updateTeacherCourse, unlinkTeacherClassroomFromCourse } from "@/services/courses/service";

const prisma = new PrismaClient();

const auditContext = {
  ipAddress: "127.0.0.1",
  userAgent: "course-service-test",
};

process.on("exit", () => {
  void prisma.$disconnect();
});

test("课程模板可以创建、编辑、停用和重新启用", async () => {
  const suffix = randomBytes(4).toString("hex");
  const templateCode = `it-course-template-${suffix}`;
  const template = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@example.com" },
    select: { id: true },
  });

  const created = await createAdminCourseTemplate(
    template.id,
    {
      code: templateCode,
      name: "测试课程模板",
      description: "模板说明",
      version: "1.0",
    },
    auditContext,
  );
  assert.equal(created.code, templateCode);
  assert.equal(created.isActive, true);
  assert.equal(created.isBuiltin, false);

  const updated = await updateAdminCourseTemplate(
    template.id,
    created.id,
    {
      name: "测试课程模板（更新）",
      description: "更新后的说明",
      version: "1.1",
    },
    auditContext,
  );
  assert.equal(updated.name, "测试课程模板（更新）");
  assert.equal(updated.version, "1.1");

  const disabled = await setAdminCourseTemplateActive(
    template.id,
    created.id,
    false,
    auditContext,
  );
  assert.equal(disabled.isActive, false);

  const activeTemplatesAfterDisable = await listTeacherCourseTemplates();
  assert.equal(
    activeTemplatesAfterDisable.some((item) => item.id === created.id),
    false,
  );

  const reenabled = await setAdminCourseTemplateActive(
    template.id,
    created.id,
    true,
    auditContext,
  );
  assert.equal(reenabled.isActive, true);
  assert.equal(
    (await listTeacherCourseTemplates()).some((item) => item.id === created.id),
    true,
  );

  await prisma.auditLog.deleteMany({
    where: { targetId: created.id },
  });
  await prisma.courseTemplate.delete({
    where: { id: created.id },
  });
});

test("教师课程可以按模板创建、避免重复并关联班级", async () => {
  const suffix = randomBytes(4).toString("hex");
  const [teacher, teacherTwo] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher@example.com" },
      select: { id: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher2@example.com" },
      select: { id: true },
    }),
  ]);
  const pythonTemplate = (await listTeacherCourseTemplates()).find(
    (template) => template.code === "python-programming-v1",
  );
  assert.ok(pythonTemplate);

  const courseNo = `IT-COURSE-${suffix.toUpperCase()}`;
  const created = await createTeacherCourse(
    teacher.id,
    {
      templateId: pythonTemplate.id,
      courseNo,
      term: "2026-2027-1",
      name: "课程服务测试",
      description: "课程说明",
    },
    auditContext,
  );
  assert.equal(created.courseNo, courseNo);
  assert.equal(created.status, CourseStatus.ACTIVE);
  assert.equal(created.classroomCount, 0);

  await assert.rejects(
    () =>
      createTeacherCourse(
        teacher.id,
        {
          templateId: pythonTemplate.id,
          courseNo,
          term: "2026-2027-1",
          name: "课程服务测试重复",
          description: "重复课程",
        },
        auditContext,
      ),
    /同一教师在同一学期下已经存在相同课程号的课程/u,
  );

  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      joinCode: `ITCOURSE${suffix.toUpperCase()}`,
      name: "课程服务关联班级",
      description: "用于课程服务测试",
      status: ClassroomStatus.ACTIVE,
      allowStudentLeave: true,
    },
    select: { id: true },
  });

  const linked = await linkTeacherClassroomToCourse(
    teacher.id,
    created.id,
    classroom.id,
    auditContext,
  );
  assert.equal(linked.linkedClassrooms.length, 1);
  assert.equal(linked.linkedClassrooms[0]?.id, classroom.id);
  assert.equal(
    linked.classrooms.find((item) => item.id === classroom.id)?.currentCourse
      ?.id,
    created.id,
  );

  const updated = await updateTeacherCourse(
    teacher.id,
    created.id,
    {
      courseNo,
      term: "2026-2027-1",
      name: "课程服务测试（更新）",
      description: "更新后的课程说明",
    },
    auditContext,
  );
  assert.equal(updated.name, "课程服务测试（更新）");
  assert.equal(updated.linkedClassrooms.length, 1);

  const fetched = await getTeacherCourse(teacher.id, created.id);
  assert.equal(fetched.linkedClassrooms.length, 1);
  assert.equal(fetched.activeClassroomCount, 1);

  const unlinked = await unlinkTeacherClassroomFromCourse(
    teacher.id,
    created.id,
    classroom.id,
    auditContext,
  );
  assert.equal(unlinked.linkedClassrooms.length, 0);
  assert.equal(
    (await getTeacherCourse(teacher.id, created.id)).classrooms.find(
      (item) => item.id === classroom.id,
    )?.currentCourse,
    null,
  );

  await assert.rejects(
    () => getTeacherCourse(teacherTwo.id, created.id),
    /课程不存在/u,
  );

  await prisma.classroom.delete({ where: { id: classroom.id } });
  await prisma.auditLog.deleteMany({
    where: { targetId: created.id },
  });
  await prisma.course.delete({ where: { id: created.id } });
});
