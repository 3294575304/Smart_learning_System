import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { AssignmentStatus, Prisma, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertSafeSeedDatabase } from "@/prisma/seed-safety";
import {
  assignmentUpsertSchema,
  autosaveAnswersSchema,
} from "@/services/assignments/schemas";
import {
  createDraftAssignment,
  getStudentSubmissionDraft,
  saveStudentAnswers,
  startOrResumeAttempt,
  submitStudentAssignment,
} from "@/services/assignments/service";
import { freezeAssignmentQuestionConcepts } from "@/services/concept-mastery/assignment-snapshot";
import { freezeAssignmentProgrammingConfigs } from "@/services/programming-questions/assignment-snapshot";

const VERSION = "classroom-assignment-trend-test-data-v1";
const LABEL = "【测试数据·学情趋势】";
const QUESTION_COUNT = 10;
const CORRECT_COUNTS = [4, 5, 6, 7, 8] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_ASSIGNMENT_TITLE = "编程题判题演示";

function assignmentTitle(courseName: string, index: number) {
  return `${LABEL}${courseName}·第${index + 1}次作业`;
}

function assignmentDescription() {
  return `${VERSION}。合成客观题答题与分数，仅用于教师端作业趋势和分数段展示，不代表学生真实学习情况，不计入正式成绩台账。`;
}

async function loadPlan(courseId: string, classroomId: string) {
  return prisma.$transaction(
    async (tx) => {
      const course = await tx.course.findFirstOrThrow({
        where: {
          id: courseId,
          status: "ACTIVE",
          teacher: { role: "TEACHER", status: "ACTIVE" },
        },
        select: {
          id: true,
          name: true,
          teacherId: true,
          questionCategoryId: true,
        },
      });
      if (!course.questionCategoryId)
        throw new Error("课程未关联题库分类，不能生成作业样本。");

      const classroom = await tx.classroom.findFirstOrThrow({
        where: {
          id: classroomId,
          courseId,
          teacherId: course.teacherId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          memberships: {
            where: {
              status: "ACTIVE",
              student: { role: "STUDENT", status: "ACTIVE" },
            },
            select: { studentId: true },
            orderBy: { studentId: "asc" },
          },
        },
      });
      if (classroom.name.replace(/\s+/gu, "") !== "Python程序设计1班") {
        throw new Error("指定班级不是 Python 程序设计1班，拒绝写入。");
      }
      const activeStudentIds = new Set(
        classroom.memberships.map((membership) => membership.studentId),
      );
      if (activeStudentIds.size === 0)
        throw new Error("班级当前没有有效在读学生。");

      const sourceAssignments = await tx.assignment.findMany({
        where: {
          classroomId,
          teacherId: course.teacherId,
          title: SOURCE_ASSIGNMENT_TITLE,
          status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED] },
        },
        include: {
          submissions: {
            where: {
              status: {
                in: [SubmissionStatus.GRADED, SubmissionStatus.PUBLISHED],
              },
              score: { not: null },
              maxScore: { gt: 0 },
            },
            select: { studentId: true },
          },
        },
      });
      if (sourceAssignments.length !== 1)
        throw new Error(
          `需要班级中唯一的“${SOURCE_ASSIGNMENT_TITLE}”演示作业来定位测试提交人。`,
        );
      const targetStudentIds = [
        ...new Set(
          sourceAssignments[0].submissions
            .map((submission) => submission.studentId)
            .filter((studentId) => activeStudentIds.has(studentId)),
        ),
      ];
      if (targetStudentIds.length !== 1)
        throw new Error(
          "演示作业必须恰好有一名当前在读学生完成最终评分，拒绝猜测测试对象。",
        );

      const questions = await tx.question.findMany({
        where: {
          questionCategoryId: course.questionCategoryId,
          status: "ACTIVE",
          deletedAt: null,
          isAssignmentOnly: false,
          type: "SINGLE_CHOICE",
          AND: [
            { options: { some: { isCorrect: true } } },
            { options: { some: { isCorrect: false } } },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: QUESTION_COUNT * CORRECT_COUNTS.length,
        select: {
          id: true,
          options: { select: { id: true, isCorrect: true } },
        },
      });
      if (questions.length !== QUESTION_COUNT * CORRECT_COUNTS.length)
        throw new Error(
          `题库中符合条件的单选题不足 ${QUESTION_COUNT * CORRECT_COUNTS.length} 道，拒绝生成不完整数据。`,
        );

      const titles = CORRECT_COUNTS.map((_, index) =>
        assignmentTitle(course.name, index),
      );
      const existingAssignments = await tx.assignment.findMany({
        where: {
          classroomId,
          teacherId: course.teacherId,
          title: { in: titles },
        },
        include: {
          questions: {
            orderBy: { sortOrder: "asc" },
            select: { questionId: true, sortOrder: true, points: true },
          },
        },
      });
      for (const assignment of existingAssignments) {
        const index = titles.indexOf(assignment.title);
        assert.notEqual(index, -1, "找到非本批次测试作业。");
        assert.equal(assignment.description, assignmentDescription());
        assert.ok(
          assignment.status === AssignmentStatus.DRAFT ||
            assignment.status === AssignmentStatus.PUBLISHED ||
            assignment.status === AssignmentStatus.CLOSED,
          "测试作业状态异常，拒绝修改。",
        );
        const expectedIds = questions
          .slice(index * QUESTION_COUNT, (index + 1) * QUESTION_COUNT)
          .map((question) => question.id);
        assert.deepEqual(
          assignment.questions.map((question) => question.questionId),
          expectedIds,
          "测试作业题目已变化，拒绝覆盖。",
        );
        assert.ok(
          assignment.questions.every(
            (question, questionIndex) =>
              question.sortOrder === questionIndex + 1 &&
              question.points.toNumber() === 1,
          ),
          "测试作业分值已变化，拒绝覆盖。",
        );
      }

      return {
        course,
        classroom,
        studentId: targetStudentIds[0],
        questions,
        titles,
        existingAssignments,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

async function publishWithoutStudentNotifications(
  teacherId: string,
  assignmentId: string,
  classroomId: string,
) {
  await prisma.$transaction(
    async (tx) => {
      const assignment = await tx.assignment.findFirst({
        where: { id: assignmentId, teacherId, classroomId },
        select: {
          id: true,
          status: true,
          publishedAt: true,
          dueAt: true,
          classroom: { select: { courseId: true, status: true } },
          _count: { select: { questions: true } },
        },
      });
      if (!assignment) throw new Error("测试作业不存在或班级归属已变化。");
      if (assignment.status === AssignmentStatus.PUBLISHED) return;
      if (
        assignment.status !== AssignmentStatus.DRAFT ||
        assignment.classroom.status !== "ACTIVE" ||
        assignment._count.questions !== QUESTION_COUNT ||
        !assignment.publishedAt ||
        !assignment.dueAt ||
        assignment.dueAt <= new Date()
      ) {
        throw new Error("测试作业不满足安全发布条件，拒绝继续。");
      }

      await freezeAssignmentQuestionConcepts(
        tx,
        assignment.id,
        assignment.classroom.courseId,
      );
      await freezeAssignmentProgrammingConfigs(tx, assignment.id);
      await tx.assignment.update({
        where: { id: assignment.id },
        data: { status: AssignmentStatus.PUBLISHED },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function createDemoSubmission(
  studentId: string,
  assignmentId: string,
  correctCount: number,
) {
  const existing = await prisma.submission.findMany({
    where: { studentId, assignmentId },
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true,
      status: true,
      score: true,
      maxScore: true,
      attemptNumber: true,
    },
  });
  if (existing.length > 1)
    throw new Error("测试作业已有多个提交，拒绝自动选择或覆盖。");

  const prior = existing[0];
  if (prior && prior.status !== SubmissionStatus.IN_PROGRESS) {
    if (
      (prior.status !== SubmissionStatus.GRADED &&
        prior.status !== SubmissionStatus.PUBLISHED) ||
      prior.score?.toNumber() !== correctCount ||
      prior.maxScore?.toNumber() !== QUESTION_COUNT
    ) {
      throw new Error("测试提交状态或分数已变化，拒绝覆盖。");
    }
    return { score: correctCount, status: prior.status, action: "reused" };
  }

  const draft = prior
    ? await getStudentSubmissionDraft(studentId, prior.id)
    : await startOrResumeAttempt(studentId, assignmentId, randomUUID());
  const questions = await prisma.assignmentQuestion.findMany({
    where: { assignmentId },
    orderBy: { sortOrder: "asc" },
    include: { optionSnapshots: true },
  });
  assert.equal(questions.length, QUESTION_COUNT);
  const answers = questions.map((question, index) => {
    assert.equal(question.typeSnapshot, "SINGLE_CHOICE");
    const isCorrect = index < correctCount;
    const option = question.optionSnapshots.find(
      (item) => item.isCorrectSnapshot === isCorrect,
    );
    assert.ok(option, "题目快照缺少正确或错误选项。");
    return {
      assignmentQuestionId: question.id,
      kind: "CHOICE" as const,
      optionIds: [option.id],
    };
  });
  await saveStudentAnswers(
    studentId,
    draft.id,
    autosaveAnswersSchema.parse({ version: draft.version, answers }),
  );
  const result = await submitStudentAssignment(studentId, draft.id);
  assert.equal(result.status, SubmissionStatus.GRADED);
  const gradedSubmission = await prisma.submission.findUniqueOrThrow({
    where: { id: draft.id },
    select: { status: true, score: true, maxScore: true },
  });
  assert.equal(gradedSubmission.status, SubmissionStatus.GRADED);
  assert.equal(gradedSubmission.score?.toNumber(), correctCount);
  assert.equal(gradedSubmission.maxScore?.toNumber(), QUESTION_COUNT);
  return {
    score: correctCount,
    status: SubmissionStatus.GRADED,
    action: prior ? "completed" : "created",
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      "course-id": { type: "string" },
      "classroom-id": { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  assertSafeSeedDatabase();
  const courseId = values["course-id"];
  const classroomId = values["classroom-id"];
  if (!courseId || !classroomId)
    throw new Error(
      "必须指定 --course-id 和 --classroom-id；默认只预览，--apply 才写入。",
    );

  const plan = await loadPlan(courseId, classroomId);
  const existingByTitle = new Map(
    plan.existingAssignments.map((assignment) => [
      assignment.title,
      assignment,
    ]),
  );
  const now = Date.now();
  const assignments = CORRECT_COUNTS.map((correctCount, index) => ({
    title: plan.titles[index],
    correctCount,
    questionIds: plan.questions
      .slice(index * QUESTION_COUNT, (index + 1) * QUESTION_COUNT)
      .map((question) => question.id),
    publishedAt: new Date(now - (CORRECT_COUNTS.length - index) * DAY_MS),
    dueAt: new Date(now + (index + 1) * DAY_MS),
  }));

  console.log(
    JSON.stringify(
      {
        mode: values.apply ? "apply" : "preview",
        version: VERSION,
        course: plan.course.name,
        classroom: plan.classroom.name,
        activeStudentCount: plan.classroom.memberships.length,
        demoSubmissionTargetCount: 1,
        assignmentCount: assignments.length,
        questionsPerAssignment: QUESTION_COUNT,
        assignments: assignments.map((item) => ({
          title: item.title,
          expectedAverage: `${item.correctCount * 10}%`,
          dueAt: item.dueAt.toISOString(),
          action: existingByTitle.has(item.title) ? "reuse/resume" : "create",
        })),
      },
      null,
      2,
    ),
  );
  if (!values.apply) return;

  for (const [index, item] of assignments.entries()) {
    let assignmentId = existingByTitle.get(item.title)?.id;
    let assignmentStatus = existingByTitle.get(item.title)?.status;
    if (!assignmentId) {
      const created = await createDraftAssignment(
        plan.course.teacherId,
        assignmentUpsertSchema.parse({
          title: item.title,
          classroomId,
          description: assignmentDescription(),
          publishedAt: item.publishedAt,
          dueAt: item.dueAt,
          questions: item.questionIds.map((questionId, questionIndex) => ({
            questionId,
            sortOrder: questionIndex + 1,
            points: 1,
          })),
        }),
      );
      assignmentId = created.id;
      assignmentStatus = AssignmentStatus.DRAFT;
    }

    assert.ok(assignmentId);
    if (assignmentStatus === AssignmentStatus.DRAFT) {
      await publishWithoutStudentNotifications(
        plan.course.teacherId,
        assignmentId,
        classroomId,
      );
    } else if (assignmentStatus === AssignmentStatus.CLOSED) {
      const hasSubmission = await prisma.submission.count({
        where: { assignmentId, studentId: plan.studentId },
      });
      if (hasSubmission === 0)
        throw new Error("已结束的测试作业尚无演示提交，不会重新开放。");
    }

    const result = await createDemoSubmission(
      plan.studentId,
      assignmentId,
      item.correctCount,
    );
    console.log(
      `${index + 1}/${assignments.length} ${item.title}: ${result.action}, ${result.score}/${QUESTION_COUNT}`,
    );
  }
  console.log("完成：作业和提交均带测试标记；自动评分保持未向学生公布。 ");
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "生成作业样本失败。",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
