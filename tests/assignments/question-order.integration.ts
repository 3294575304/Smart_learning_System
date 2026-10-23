import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { QuestionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { organizeAssignmentQuestions } from "@/services/assignments/question-order";
import { assignmentUpsertSchema } from "@/services/assignments/schemas";
import {
  createDraftAssignment,
  updateDraftAssignment,
  publishAssignment,
  getStudentAssignment,
  getTeacherAssignment,
} from "@/services/assignments/service";
import { createProgrammingConfigRevision } from "@/services/programming-questions/service";

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.match(
    target.searchParams.get("schema") ?? "",
    /^teaching_it_[a-z0-9_]+$/,
  );
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const otherTeacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher2@example.com" },
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
      name: "题序测试",
      courseNo: "ORDER-TEST",
      term: "2026",
      status: "ACTIVE",
    },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "题序测试班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: student.id } },
    },
  });
  const types: QuestionType[] = [
    "SHORT_ANSWER",
    "PYTHON_PROGRAMMING",
    "SINGLE_CHOICE",
    "FILL_BLANK",
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "SINGLE_CHOICE",
  ];
  const questions = [];
  for (const [index, type] of types.entries()) {
    const question = await prisma.question.create({
      data: {
        creatorId: teacher.id,
        title: `题序测试${index}`,
        content: "题序集成测试题干",
        explanation: "测试解析",
        type,
        difficulty: 1,
        status: "ACTIVE",
        correctBoolean: type === "TRUE_FALSE" ? true : null,
        referenceAnswer: type === "SHORT_ANSWER" ? "参考答案" : null,
        acceptableAnswers: type === "FILL_BLANK" ? ["答案"] : [],
        ...(type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE"
          ? {
              options: {
                create: [
                  {
                    label: "A",
                    content: "正确",
                    isCorrect: true,
                    sortOrder: 1,
                  },
                  {
                    label: "B",
                    content: "错误",
                    isCorrect: false,
                    sortOrder: 2,
                  },
                ],
              },
            }
          : {}),
      },
    });
    if (type === "PYTHON_PROGRAMMING")
      await createProgrammingConfigRevision(
        teacher.id,
        question.id,
        {
          standardCode: "print(input())",
          starterCode: "",
          totalPoints: 10,
          limits: {
            cpuTimeMs: 1000,
            wallTimeMs: 2000,
            memoryBytes: 67108864,
            outputBytes: 65536,
            processCount: 1,
          },
          testCases: [
            {
              name: "公开",
              visibility: "PUBLIC",
              stdin: "1",
              expectedOutput: "1",
              points: 5,
              sortOrder: 1,
            },
            {
              name: "隐藏",
              visibility: "HIDDEN",
              stdin: "2",
              expectedOutput: "2",
              points: 5,
              sortOrder: 2,
            },
          ],
        },
        { ipAddress: null, userAgent: "question-order-test" },
      );
    questions.push({ id: question.id, type, points: 10 });
  }
  const ordered = organizeAssignmentQuestions(questions);
  const input = assignmentUpsertSchema.parse({
    title: "自动题序发布测试",
    classroomId: classroom.id,
    publishedAt: new Date(Date.now() - 1000),
    dueAt: new Date(Date.now() + 3600000),
    questions: ordered.map((q, index) => ({
      questionId: q.id,
      sortOrder: index + 1,
      points: q.points,
    })),
  });
  const draft = await createDraftAssignment(teacher.id, input);
  const saved = await getTeacherAssignment(teacher.id, draft.id);
  assert.deepEqual(
    saved.questions.map((q) => q.questionId),
    ordered.map((q) => q.id),
  );
  await assert.rejects(() => publishAssignment(otherTeacher.id, draft.id));
  await publishAssignment(teacher.id, draft.id);
  await publishAssignment(teacher.id, draft.id);
  const published = await getStudentAssignment(student.id, draft.id);
  assert.deepEqual(
    published.questions.map((q) => q.type),
    ordered.map((q) => q.type),
  );
  assert.deepEqual(
    published.questions.map((q) => q.sortOrder),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(published.totalPoints, 70);
  assert.ok(
    await prisma.assignmentProgrammingConfigSnapshot.findFirst({
      where: { assignmentQuestion: { assignmentId: draft.id } },
    }),
  );
  await assert.rejects(() =>
    updateDraftAssignment(teacher.id, draft.id, {
      ...input,
      questions: [...input.questions].reverse(),
    }),
  );
  const manualInput = {
    ...input,
    title: "手动题序发布测试",
    questions: questions.map((q, index) => ({
      questionId: q.id,
      sortOrder: index + 1,
      points: q.points,
    })),
  };
  const manual = await createDraftAssignment(teacher.id, manualInput);
  await publishAssignment(teacher.id, manual.id);
  assert.deepEqual(
    (await getStudentAssignment(student.id, manual.id)).questions.map(
      (q) => q.type,
    ),
    types,
  );
  console.log(
    "PASS six-type ordering, stable same-type sequence, draft persistence, student order, programming freeze, repeated publication, ownership and manual-order preservation",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
