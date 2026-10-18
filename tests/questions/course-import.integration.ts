import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { listQuestionImportCourses } from "@/services/question-import/courses";
import {
  commitAdminQuestionImport,
  commitTeacherQuestionImport,
} from "@/services/question-import/service";
import { questionImportCommitSchema } from "@/services/question-import/schemas";
import { listTeacherQuestions } from "@/services/questions/service";
import { questionListQuerySchema } from "@/services/questions/schemas";
import { loadAdminQuestionPage } from "@/services/admin/questions/repository";
import { adminQuestionListQuerySchema } from "@/services/admin/questions/schemas";

async function main() {
  const teacher = await prisma.user.findFirstOrThrow({
    where: { role: "TEACHER" },
  });
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN" },
  });
  const other = await prisma.user.create({
    data: { role: "TEACHER", passwordHash: teacher.passwordHash },
  });
  const student = await prisma.user.findFirstOrThrow({
    where: { role: "STUDENT" },
  });
  const suffix = randomBytes(4).toString("hex");
  const firstCategory = await prisma.questionCourseCategory.create({
    data: {
      name: `共享题库测试课程 ${suffix}`,
      normalizedName: `shared-test-course-${suffix}`,
    },
  });
  const secondCategory = await prisma.questionCourseCategory.create({
    data: {
      name: `共享题库测试课程二 ${suffix}`,
      normalizedName: `shared-test-course-two-${suffix}`,
    },
  });
  const available = await listQuestionImportCourses();
  assert.ok(available.some((item) => item.id === firstCategory.id));
  assert.ok(available.some((item) => item.id === secondCategory.id));

  const input = (categoryId: string) =>
    questionImportCommitSchema.parse({
      categoryId,
      source: { fileName: "test.txt", checksum: "a".repeat(64) },
      questions: [
        {
          rowKey: "1",
          title: "课程分类测试",
          content: "空列表转换为布尔值是 False。",
          type: "TRUE_FALSE",
          difficulty: 1,
          options: [],
          answer: { kind: "BOOLEAN", value: true },
          explanation: "空列表是假值。",
          tags: [],
        },
      ],
    });
  const context = { ipAddress: null, userAgent: "shared-question-import-test" };

  await assert.rejects(
    () =>
      commitTeacherQuestionImport(student.id, input(firstCategory.id), context),
    /无权导入/u,
  );
  await assert.rejects(
    () =>
      commitAdminQuestionImport(teacher.id, input(firstCategory.id), context),
    /无权导入/u,
  );
  await assert.rejects(
    () =>
      commitTeacherQuestionImport(
        teacher.id,
        input("c0000000000000000000000000"),
        context,
      ),
    /课程分类不存在或已停用/u,
  );

  const result = await commitTeacherQuestionImport(
    teacher.id,
    input(firstCategory.id),
    context,
  );
  assert.equal(result.createdCount, 1);
  const record = await prisma.question.findUniqueOrThrow({
    where: { id: result.questionIds[0] },
    include: { graphBindings: true, knowledgePointLinks: true },
  });
  assert.equal(record.questionCategoryId, firstCategory.id);
  assert.equal(record.categoryCourseId, null);
  assert.equal(record.graphBindings.length, 0);
  assert.equal(record.knowledgePointLinks.length, 0);

  const repeated = await commitTeacherQuestionImport(
    teacher.id,
    input(firstCategory.id),
    context,
  );
  assert.equal(repeated.createdCount, 1);
  assert.equal(repeated.skippedCount, 0);
  assert.notEqual(repeated.questionIds[0], record.id);

  const secondCategoryImport = await commitTeacherQuestionImport(
    other.id,
    input(secondCategory.id),
    context,
  );
  assert.equal(secondCategoryImport.createdCount, 1);

  const shared = await listTeacherQuestions(
    other.id,
    questionListQuerySchema.parse({
      scope: "OWNED",
      categoryId: firstCategory.id,
      keyword: "课程分类测试",
    }),
  );
  assert.equal(shared.pagination.total, 2);
  assert.ok(shared.items.some((item) => item.id === record.id));

  const adminImport = await commitAdminQuestionImport(
    admin.id,
    input(firstCategory.id),
    context,
  );
  assert.equal(adminImport.createdCount, 1);
  const adminList = await loadAdminQuestionPage(
    adminQuestionListQuerySchema.parse({
      categoryId: firstCategory.id,
      keyword: "课程分类测试",
    }),
  );
  assert.equal(adminList.total, 3);
  console.log(
    "PASS: category based imports, teacher shared access, ignored legacy scope, duplicate preservation, role checks, and admin filters",
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
