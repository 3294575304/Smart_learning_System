import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  AuditAction,
  AuditTargetType,
  ClassroomStatus,
  CourseFileKind,
  CourseStatus,
  PrismaClient,
  StudentImportBatchStatus,
} from "@prisma/client";

import {
  createAdminCourseTemplate,
  createTeacherCourse,
  deleteTeacherCourse,
  getTeacherCourse,
  linkTeacherClassroomToCourse,
  listTeacherCourses,
  listTeacherCourseTemplates,
  setAdminCourseTemplateActive,
  updateAdminCourseTemplate,
  updateTeacherCourse,
  unlinkTeacherClassroomFromCourse,
} from "@/services/courses/service";
import type { StorageService } from "@/services/storage/types";

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

test("教师可以删除空草稿课程并保留班级、成员和账号", async () => {
  const suffix = randomBytes(4).toString("hex");
  const [teacher, student, template] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher@example.com" },
      select: { id: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: "student@example.com" },
      select: { id: true },
    }),
    prisma.courseTemplate.findFirstOrThrow({
      where: { code: "python-programming-v1" },
      select: { id: true },
    }),
  ]);
  const course = await prisma.course.create({
    data: {
      templateId: template.id,
      teacherId: teacher.id,
      courseNo: `DELETE-${suffix.toUpperCase()}`,
      term: "2026-2027-1",
      name: "待删除空草稿课程",
      status: CourseStatus.DRAFT,
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      joinCode: `DELETE${suffix.toUpperCase()}`,
      name: "删除课程保留班级",
      status: ClassroomStatus.ACTIVE,
      memberships: {
        create: {
          studentId: student.id,
        },
      },
    },
    select: { id: true },
  });
  const courseFile = await prisma.courseFileVersion.create({
    data: {
      courseId: course.id,
      uploadedById: teacher.id,
      fileKind: CourseFileKind.IMPORT_SOURCE,
      fileKey: "student-roster",
      title: "学生名单",
      originalFileName: "students.xlsx",
      storageKey: `course/${course.id}/students.xlsx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 128,
      checksumSha256: "a".repeat(64),
    },
  });
  const batch = await prisma.studentImportBatch.create({
    data: {
      courseId: course.id,
      classroomId: classroom.id,
      createdById: teacher.id,
      sourceFileVersionId: courseFile.id,
      status: StudentImportBatchStatus.PREVIEW_READY,
      idempotencyKey: `delete-preview-${suffix}`,
      sourceFileName: "students.xlsx",
      sourceFileChecksum: "a".repeat(64),
      sourceFileMimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sourceFileSizeBytes: 128,
      mappingConfig: {},
      rows: {
        create: {
          rowNumber: 1,
          rowKey: `delete-row-${suffix}`,
          sourceRow: {},
          academicTerm: "2026-2027-1",
          courseNo: course.courseNo,
          studentNo: `S${suffix}`,
          studentName: "预览学生",
          className: classroom.id,
        },
      },
    },
  });
  const syllabus = await prisma.courseSyllabus.create({
    data: {
      courseId: course.id,
      uploadedById: teacher.id,
      originalName: "syllabus.pdf",
      mimeType: "application/pdf",
      sizeBytes: 64,
      storageKey: `course-syllabi/${course.id}.pdf`,
    },
  });

  const deletedStorageKeys: string[] = [];
  const storage: StorageService = {
    save: async () => undefined,
    read: async () => Buffer.alloc(0),
    delete: async (storageKey) => {
      assert.equal(
        await prisma.course.count({ where: { id: course.id } }),
        0,
        "物理文件只能在数据库事务提交后删除",
      );
      deletedStorageKeys.push(storageKey);
    },
  };

  const result = await deleteTeacherCourse(
    teacher.id,
    course.id,
    auditContext,
    { storage },
  );
  assert.equal(result.id, course.id);
  assert.equal(
    (await listTeacherCourses(teacher.id)).some(
      (item) => item.id === course.id,
    ),
    false,
  );
  assert.deepEqual(
    deletedStorageKeys.sort(),
    [courseFile.storageKey, syllabus.storageKey].sort(),
  );
  assert.equal(
    await prisma.studentImportBatch.count({ where: { id: batch.id } }),
    0,
  );

  const preservedClassroom = await prisma.classroom.findUniqueOrThrow({
    where: { id: classroom.id },
    select: {
      courseId: true,
      memberships: {
        where: { studentId: student.id },
        select: { id: true },
      },
    },
  });
  assert.equal(preservedClassroom.courseId, null);
  assert.equal(preservedClassroom.memberships.length, 1);
  assert.equal(
    await prisma.user.count({
      where: { id: { in: [teacher.id, student.id] } },
    }),
    2,
  );

  const audit = await prisma.auditLog.findFirstOrThrow({
    where: {
      action: AuditAction.COURSE_DELETED,
      targetType: AuditTargetType.COURSE,
      targetId: course.id,
    },
    orderBy: { createdAt: "desc" },
  });
  assert.match(audit.summary, /待删除空草稿课程/u);
  assert.equal(
    (audit.beforeData as { teacherId?: string } | null)?.teacherId,
    teacher.id,
  );

  await prisma.auditLog.delete({ where: { id: audit.id } });
  await prisma.classMembership.deleteMany({
    where: { classroomId: classroom.id },
  });
  await prisma.classroom.delete({ where: { id: classroom.id } });
});

test("课程删除会阻止正式教学数据并在数据库异常时完整回滚", async () => {
  const suffix = randomBytes(4).toString("hex");
  const [teacher, teacherTwo, template] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher@example.com" },
      select: { id: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher2@example.com" },
      select: { id: true },
    }),
    prisma.courseTemplate.findFirstOrThrow({
      where: { code: "python-programming-v1" },
      select: { id: true },
    }),
  ]);
  const createDraft = (label: string) =>
    prisma.course.create({
      data: {
        templateId: template.id,
        teacherId: teacher.id,
        courseNo: `DELETE-${label}-${suffix.toUpperCase()}`,
        term: "2026-2027-1",
        name: `删除测试-${label}`,
        status: CourseStatus.DRAFT,
      },
    });

  const protectedCourse = await createDraft("FORMAL");
  const protectedClassroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: protectedCourse.id,
      joinCode: `FORMAL${suffix.toUpperCase()}`,
      name: "已有正式教学数据",
    },
  });
  const assignment = await prisma.assignment.create({
    data: {
      classroomId: protectedClassroom.id,
      teacherId: teacher.id,
      title: "已发布作业",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  await assert.rejects(
    () => deleteTeacherCourse(teacher.id, protectedCourse.id, auditContext),
    /已经产生作业/u,
  );
  assert.equal(
    await prisma.course.count({ where: { id: protectedCourse.id } }),
    1,
  );
  await assert.rejects(
    () => deleteTeacherCourse(teacherTwo.id, protectedCourse.id, auditContext),
    /课程不存在/u,
  );
  await assert.rejects(
    () =>
      deleteTeacherCourse(
        teacher.id,
        "cm12345678901234567890123",
        auditContext,
      ),
    /课程不存在/u,
  );

  const rollbackCourse = await createDraft("ROLLBACK");
  const rollbackClassroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: rollbackCourse.id,
      joinCode: `ROLLBACK${suffix.toUpperCase()}`,
      name: "事务回滚班级",
    },
  });
  let storageDeleteCalled = false;
  await assert.rejects(
    () =>
      deleteTeacherCourse(teacher.id, rollbackCourse.id, auditContext, {
        storage: {
          save: async () => undefined,
          read: async () => Buffer.alloc(0),
          delete: async () => {
            storageDeleteCalled = true;
          },
        },
        writeAuditLog: async () => {
          throw new Error("simulated audit database failure");
        },
      }),
    /simulated audit database failure/u,
  );
  assert.equal(storageDeleteCalled, false);
  assert.equal(
    await prisma.course.count({ where: { id: rollbackCourse.id } }),
    1,
  );
  assert.equal(
    (
      await prisma.classroom.findUniqueOrThrow({
        where: { id: rollbackClassroom.id },
        select: { courseId: true },
      })
    ).courseId,
    rollbackCourse.id,
  );

  await prisma.assignment.delete({ where: { id: assignment.id } });
  await prisma.classroom.deleteMany({
    where: { id: { in: [protectedClassroom.id, rollbackClassroom.id] } },
  });
  await prisma.course.deleteMany({
    where: { id: { in: [protectedCourse.id, rollbackCourse.id] } },
  });
});

test("课程数据库删除成功后文件清理失败只记录错误", async () => {
  const suffix = randomBytes(4).toString("hex");
  const [teacher, template] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher@example.com" },
      select: { id: true },
    }),
    prisma.courseTemplate.findFirstOrThrow({
      where: { code: "python-programming-v1" },
      select: { id: true },
    }),
  ]);
  const course = await prisma.course.create({
    data: {
      templateId: template.id,
      teacherId: teacher.id,
      courseNo: `DELETE-FILE-${suffix.toUpperCase()}`,
      term: "2026-2027-1",
      name: "文件清理失败草稿",
      status: CourseStatus.DRAFT,
    },
  });
  await prisma.courseSyllabus.create({
    data: {
      courseId: course.id,
      uploadedById: teacher.id,
      originalName: "cleanup-failure.pdf",
      mimeType: "application/pdf",
      sizeBytes: 64,
      storageKey: `course-syllabi/cleanup-failure-${suffix}.pdf`,
    },
  });
  const loggedErrors: unknown[][] = [];

  const result = await deleteTeacherCourse(
    teacher.id,
    course.id,
    auditContext,
    {
      storage: {
        save: async () => undefined,
        read: async () => Buffer.alloc(0),
        delete: async () => {
          throw new Error("simulated file cleanup failure");
        },
      },
      logger: {
        error: (...args: unknown[]) => {
          loggedErrors.push(args);
        },
      },
    },
  );

  assert.equal(result.id, course.id);
  assert.equal(await prisma.course.count({ where: { id: course.id } }), 0);
  assert.equal(loggedErrors.length, 1);
  assert.match(String(loggedErrors[0]?.[0]), /Failed to delete course file/u);

  await prisma.auditLog.deleteMany({ where: { targetId: course.id } });
});
