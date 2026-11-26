import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { CourseStatus, PrismaClient } from "@prisma/client";

import {
  createTeacherCourse,
  listTeacherCourseTemplates,
  updateTeacherCourse,
} from "@/services/courses/service";

const prisma = new PrismaClient();
const auditContext = { ipAddress: null, userAgent: null };

async function createCatalogCategory(
  teacherId: string,
  suffix: string,
  courseNo: string | null,
) {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { id: teacherId },
    select: { schoolId: true },
  });
  if (!teacher.schoolId)
    throw new Error("Test teacher must belong to a school");
  const name = `目录绑定测试-${suffix}`;
  return prisma.questionCourseCategory.create({
    data: {
      schoolId: teacher.schoolId,
      name,
      normalizedName: name.toLocaleLowerCase("zh-CN"),
      courseNo,
    },
    select: { id: true, name: true, courseNo: true },
  });
}

async function loadTeacherAndTemplate() {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
    select: { id: true },
  });
  const template = (await listTeacherCourseTemplates(teacher.id)).find(
    (item) => item.code === "python-programming-v1",
  );
  assert.ok(template);
  return { teacherId: teacher.id, templateId: template.id };
}

async function cleanupCourse(courseId: string) {
  await prisma.auditLog.deleteMany({ where: { targetId: courseId } });
  await prisma.course.deleteMany({ where: { id: courseId } });
}

async function cleanupCategory(categoryId: string) {
  await prisma.auditLog.deleteMany({ where: { targetId: categoryId } });
  await prisma.questionCourseCategory.deleteMany({ where: { id: categoryId } });
}

test("教师建课的课程号必须与课程目录一致", async () => {
  const { teacherId, templateId } = await loadTeacherAndTemplate();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  const catalogNo = `CAT-${suffix}`;
  const category = await createCatalogCategory(teacherId, suffix, catalogNo);
  let createdId = "";

  try {
    await assert.rejects(
      () =>
        createTeacherCourse(
          teacherId,
          {
            templateId,
            questionCategoryId: category.id,
            courseNo: `FREE-${suffix}`,
            term: "2026-2027-1",
            name: "目录绑定测试课程",
            description: "",
          },
          auditContext,
        ),
      /课程号必须与课程目录一致/u,
    );

    const created = await createTeacherCourse(
      teacherId,
      {
        templateId,
        questionCategoryId: category.id,
        courseNo: catalogNo,
        term: "2026-2027-1",
        name: "目录绑定测试课程",
        description: "",
      },
      auditContext,
    );
    createdId = created.id;
    assert.equal(created.courseNo, catalogNo);
    // 分类与课程号都没变，只改名称：不做一致性断言，允许保存。
    const renamed = await updateTeacherCourse(
      teacherId,
      created.id,
      {
        templateId,
        questionCategoryId: category.id,
        courseNo: catalogNo,
        term: "2026-2027-1",
        name: "目录绑定测试课程（改名）",
        description: "",
      },
      auditContext,
    );
    assert.equal(renamed.name, "目录绑定测试课程（改名）");
    assert.equal(renamed.courseNo, catalogNo);

    await assert.rejects(
      () =>
        updateTeacherCourse(
          teacherId,
          created.id,
          {
            templateId,
            questionCategoryId: category.id,
            courseNo: `OTHER-${suffix}`,
            term: "2026-2027-1",
            name: "目录绑定测试课程（改名）",
            description: "",
          },
          auditContext,
        ),
      /课程号必须与课程目录一致/u,
    );
  } finally {
    if (createdId) await cleanupCourse(createdId);
    await cleanupCategory(category.id);
  }
});

test("目录未维护课程号时教师仍可手填课程号", async () => {
  const { teacherId, templateId } = await loadTeacherAndTemplate();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  const category = await createCatalogCategory(teacherId, suffix, null);
  let createdId = "";

  try {
    const created = await createTeacherCourse(
      teacherId,
      {
        templateId,
        questionCategoryId: category.id,
        courseNo: `MANUAL-${suffix}`,
        term: "2026-2027-1",
        name: "手填课程号测试",
        description: "",
      },
      auditContext,
    );
    createdId = created.id;
    assert.equal(created.courseNo, `MANUAL-${suffix}`);
  } finally {
    if (createdId) await cleanupCourse(createdId);
    await cleanupCategory(category.id);
  }
});

test("存量课程号与目录不一致时只改其他字段可保存，改号必须回到目录值", async () => {
  const { teacherId, templateId } = await loadTeacherAndTemplate();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  const catalogNo = `CATA-${suffix}`;
  const legacyNo = `LEGACY-${suffix}`;
  const category = await createCatalogCategory(teacherId, suffix, catalogNo);
  const course = await prisma.course.create({
    data: {
      name: "存量不一致课程",
      courseNo: legacyNo,
      term: "2026-2027-1",
      teacherId,
      templateId,
      questionCategoryId: category.id,
      status: CourseStatus.ACTIVE,
    },
    select: { id: true },
  });

  try {
    const renamed = await updateTeacherCourse(
      teacherId,
      course.id,
      {
        templateId,
        questionCategoryId: category.id,
        courseNo: legacyNo,
        term: "2026-2027-1",
        name: "存量不一致课程（改名）",
        description: "",
      },
      auditContext,
    );
    assert.equal(renamed.courseNo, legacyNo);

    await assert.rejects(
      () =>
        updateTeacherCourse(
          teacherId,
          course.id,
          {
            templateId,
            questionCategoryId: category.id,
            courseNo: `LEGACY2-${suffix}`,
            term: "2026-2027-1",
            name: "存量不一致课程（改名）",
            description: "",
          },
          auditContext,
        ),
      /课程号必须与课程目录一致/u,
    );

    const synced = await updateTeacherCourse(
      teacherId,
      course.id,
      {
        templateId,
        questionCategoryId: category.id,
        courseNo: catalogNo,
        term: "2026-2027-1",
        name: "存量不一致课程（改名）",
        description: "",
      },
      auditContext,
    );
    assert.equal(synced.courseNo, catalogNo);
  } finally {
    await cleanupCourse(course.id);
    await cleanupCategory(category.id);
  }
});
