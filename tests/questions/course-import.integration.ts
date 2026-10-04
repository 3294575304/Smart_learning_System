import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { listQuestionImportCourses } from "@/services/question-import/courses";
import {
  commitTeacherQuestionImport,
  commitAdminQuestionImport,
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
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const createCourse = (
    teacherId: string,
    name: string,
    status: "DRAFT" | "ARCHIVED" = "DRAFT",
  ) =>
    prisma.course.create({
      data: {
        teacherId,
        templateId: template.id,
        name,
        courseNo: name,
        term: "2026-2027-1",
        status,
      },
    });
  const first = await createCourse(teacher.id, "Python测试课程");
  const second = await createCourse(teacher.id, "Java测试课程");
  const foreign = await createCourse(other.id, "外部教师课程");
  const archived = await createCourse(teacher.id, "已归档课程", "ARCHIVED");
  const available = await listQuestionImportCourses(teacher.id);
  assert.ok(available.some((c) => c.id === first.id));
  assert.ok(available.some((c) => c.id === second.id));
  assert.ok(!available.some((c) => [foreign.id, archived.id].includes(c.id)));
  assert.ok(
    (await listQuestionImportCourses()).some((c) => c.id === foreign.id),
  );
  const input = (courseId: string) =>
    questionImportCommitSchema.parse({
      courseId,
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
  const context = { ipAddress: null, userAgent: "isolated-course-import-test" };
  for (const courseId of [
    foreign.id,
    archived.id,
    "c0000000000000000000000000",
  ])
    await assert.rejects(
      () => commitTeacherQuestionImport(teacher.id, input(courseId), context),
      /课程不存在或无权访问/,
    );
  await assert.rejects(
    () => commitTeacherQuestionImport(student.id, input(first.id), context),
    /无权导入/,
  );
  await assert.rejects(
    () => commitAdminQuestionImport(teacher.id, input(first.id), context),
    /无权导入/,
  );
  assert.equal(
    await prisma.question.count({ where: { title: "课程分类测试" } }),
    0,
  );
  const result = await commitTeacherQuestionImport(
    teacher.id,
    input(first.id),
    context,
  );
  assert.equal(result.createdCount, 1);
  const record = await prisma.question.findUniqueOrThrow({
    where: { id: result.questionIds[0] },
    include: { graphBindings: true, knowledgePointLinks: true },
  });
  assert.equal(record.categoryCourseId, first.id);
  assert.equal(record.visibility, "PRIVATE");
  assert.equal(record.graphBindings.length, 0);
  assert.equal(record.knowledgePointLinks.length, 0);
  assert.equal(
    (await commitTeacherQuestionImport(teacher.id, input(first.id), context))
      .skippedCount,
    1,
  );
  assert.equal(
    (await commitTeacherQuestionImport(teacher.id, input(second.id), context))
      .createdCount,
    1,
  );
  const listed = await listTeacherQuestions(
    teacher.id,
    questionListQuerySchema.parse({
      scope: "OWNED",
      courseId: first.id,
      keyword: "课程分类测试",
    }),
  );
  assert.equal(listed.pagination.total, 1);
  assert.equal(listed.items[0]?.id, record.id);
  await assert.rejects(
    () =>
      listTeacherQuestions(
        other.id,
        questionListQuerySchema.parse({ scope: "OWNED", courseId: first.id }),
      ),
    /课程不存在/,
  );
  const pub = await commitAdminQuestionImport(
    admin.id,
    input(foreign.id),
    context,
  );
  assert.equal(pub.createdCount, 1);
  const adminList = await loadAdminQuestionPage(
    adminQuestionListQuerySchema.parse({
      courseId: foreign.id,
      keyword: "课程分类测试",
    }),
  );
  assert.equal(adminList.total, 1);
  console.log(
    "PASS: dynamic courses, ownership/role/archive/missing checks, atomic failure, course persistence, no fabricated bindings, scoped deduplication, teacher/admin filters",
  );
}
main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
