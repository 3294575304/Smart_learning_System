import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { startOrResumeAttempt } from "@/services/assignments/service";
import {
  cancelExamSession,
  createExamSession,
  listEligibleExamQuestions,
  recordExamSwitch,
} from "@/services/exams/service";
import { examCreateSchema } from "@/services/exams/schemas";

async function main() {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  const other = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher2@example.com" },
  });
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const category = await prisma.questionCourseCategory.create({
    data: { name: "考试集成分类", normalizedName: `exam-${randomUUID()}` },
  });
  const course = await prisma.course.create({
    data: {
      teacherId: teacher.id,
      templateId: template.id,
      questionCategoryId: category.id,
      name: "考试集成课程",
      courseNo: `EX-${randomUUID().slice(0, 6)}`,
      term: "2026",
      status: "ACTIVE",
    },
  });
  const first = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "考试一班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: student.id } },
    },
  });
  const second = await prisma.classroom.create({
    data: {
      teacherId: teacher.id,
      courseId: course.id,
      name: "考试二班",
      joinCode: randomUUID(),
    },
  });
  const content = `不可重复题干 ${randomUUID()}`;
  const question = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      questionCategoryId: category.id,
      title: "考试题",
      content,
      type: "FILL_BLANK",
      difficulty: 1,
      status: "ACTIVE",
      explanation: "解析",
      acceptableAnswers: ["答案"],
    },
  });
  const duplicate = await prisma.question.create({
    data: {
      creatorId: teacher.id,
      questionCategoryId: category.id,
      title: "重复导入的题",
      content: ` ${content} `,
      type: "FILL_BLANK",
      difficulty: 1,
      status: "ACTIVE",
      explanation: "解析",
      acceptableAnswers: ["答案"],
    },
  });
  const future = new Date(Date.now() + 60_000);
  const input = examCreateSchema.parse({
    requestId: randomUUID(),
    courseId: course.id,
    classroomIds: [first.id, second.id],
    type: "MIDTERM",
    title: "期中考试",
    startsAt: future,
    endsAt: new Date(Date.now() + 3_600_000),
    allowedSwitches: 0,
    questions: [{ questionId: question.id, points: 100 }],
  });
  await assert.rejects(createExamSession(other.id, input));
  const exam = await createExamSession(teacher.id, input);
  assert.equal(exam.assignments.length, 2);
  assert.equal((await createExamSession(teacher.id, input)).id, exam.id);
  await assert.rejects(
    createExamSession(teacher.id, { ...input, title: "其他试卷" }),
  );
  const eligible = await listEligibleExamQuestions(teacher.id, {
    courseId: course.id,
    startsAt: future,
  });
  assert.equal(eligible.find((item) => item.id === question.id)?.blocked, true);
  assert.equal(
    eligible.find((item) => item.id === duplicate.id)?.blocked,
    true,
  );
  await assert.rejects(
    createExamSession(teacher.id, {
      ...input,
      requestId: randomUUID(),
      questions: [{ questionId: duplicate.id, points: 100 }],
    }),
  );
  await cancelExamSession(teacher.id, exam.id);
  assert.equal(
    (
      await listEligibleExamQuestions(teacher.id, {
        courseId: course.id,
        startsAt: future,
      })
    ).find((item) => item.id === question.id)?.blocked,
    false,
  );
  const live = await createExamSession(teacher.id, {
    ...input,
    requestId: randomUUID(),
    classroomIds: [first.id],
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 3_600_000),
  });
  const attempt = await startOrResumeAttempt(
    student.id,
    live.assignments[0].id,
    randomUUID(),
  );
  const switched = await recordExamSwitch(student.id, attempt.id, randomUUID());
  assert.equal(switched.shouldSubmit, true);
  const saved = await prisma.submission.findUniqueOrThrow({
    where: { id: attempt.id },
  });
  assert.notEqual(saved.status, "IN_PROGRESS");
  console.log("Exam integration passed");
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
