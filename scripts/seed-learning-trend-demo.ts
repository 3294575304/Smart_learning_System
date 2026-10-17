import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  assignmentUpsertSchema,
  autosaveAnswersSchema,
} from "@/services/assignments/schemas";
import {
  createDraftAssignment,
  publishAssignment,
  startOrResumeAttempt,
  saveStudentAnswers,
  submitStudentAssignment,
} from "@/services/assignments/service";
import { publishAssignmentResults } from "@/services/assignments/manual-grading";

async function main() {
  assert.notEqual(process.env.NODE_ENV, "production", "仅允许本地演示环境");
  const target = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname),
    "仅允许本机数据库",
  );
  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      profile: { is: { displayName: { contains: "布" } } },
    },
    select: { id: true },
  });
  assert.equal(students.length, 1, "学生匹配不唯一，停止写入");
  const student = students[0];
  assert.ok(student);
  const source = await prisma.assignment.findFirstOrThrow({
    where: { title: "【流程验收·错题本】跨章节错题筛选样本（2026-10-12）" },
    include: {
      classroom: {
        include: {
          memberships: { where: { studentId: student.id, status: "ACTIVE" } },
        },
      },
      questions: {
        orderBy: { sortOrder: "asc" },
        include: { sourceQuestion: true },
      },
    },
  });
  assert.match(source.classroom.name, /流程验收.*3人/);
  assert.equal(source.classroom.memberships.length, 1);
  assert.equal(source.questions.length, 13);
  assert.ok(
    source.questions.every(
      (q) =>
        q.sourceQuestion &&
        q.sourceQuestion.status === "ACTIVE" &&
        ["SINGLE_CHOICE", "FILL_BLANK"].includes(q.typeSnapshot),
    ),
  );
  const execute = process.argv.includes("--execute");
  console.log(
    execute
      ? "执行本地验收样本（不修改原有作答）"
      : "预览：添加四份13题验收作业，答对4/7/10/12题；--execute 才会写入",
  );
  for (const correctCount of [4, 7, 10, 12]) {
    const title = `【流程验收·趋势对比】知识巩固 ${correctCount}/13（2026-10-12）`;
    console.log(title);
    if (!execute) continue;
    let assignment = await prisma.assignment.findFirst({
      where: {
        teacherId: source.teacherId,
        classroomId: source.classroomId,
        title,
      },
      select: { id: true, status: true },
    });
    if (!assignment) {
      const created = await createDraftAssignment(
        source.teacherId,
        assignmentUpsertSchema.parse({
          title,
          classroomId: source.classroomId,
          description:
            "流程验收测试数据：用于展示不同得分率与知识证据，不代表学生真实能力，不同步正式成绩台账。",
          publishedAt: new Date(Date.now() - 60000),
          dueAt: new Date(Date.now() + 7 * 86400000),
          questions: source.questions.map((q, i) => ({
            questionId: q.questionId,
            sortOrder: i + 1,
            points: 1,
          })),
        }),
      );
      assignment = { id: created.id, status: "DRAFT" };
    }
    if (assignment.status === "DRAFT")
      await publishAssignment(source.teacherId, assignment.id);
    let submission = await prisma.submission.findFirst({
      where: { assignmentId: assignment.id, studentId: student.id },
      select: { id: true, status: true },
    });
    if (!submission || submission.status === "IN_PROGRESS") {
      const draft = await startOrResumeAttempt(
        student.id,
        assignment.id,
        randomUUID(),
      );
      const questions = await prisma.assignmentQuestion.findMany({
        where: { assignmentId: assignment.id },
        orderBy: { sortOrder: "asc" },
        include: { optionSnapshots: true },
      });
      const answers = questions.map((q, i) => {
        const correct = i < correctCount;
        if (q.typeSnapshot === "SINGLE_CHOICE") {
          const option = q.optionSnapshots.find(
            (o) => o.isCorrectSnapshot === correct,
          );
          assert.ok(option, "缺少可用选项");
          return {
            assignmentQuestionId: q.id,
            kind: "CHOICE",
            optionIds: [option.id],
          };
        }
        const accepted = q.acceptableAnswersSnapshot;
        assert.ok(Array.isArray(accepted) && typeof accepted[0] === "string");
        return {
          assignmentQuestionId: q.id,
          kind: "TEXT",
          value: correct ? accepted[0] : "流程验收_故意错误答案",
        };
      });
      await saveStudentAnswers(
        student.id,
        draft.id,
        autosaveAnswersSchema.parse({ version: draft.version, answers }),
      );
      await submitStudentAssignment(student.id, draft.id);
      submission = await prisma.submission.findUniqueOrThrow({
        where: { id: draft.id },
        select: { id: true, status: true },
      });
    }
    if (submission.status === "GRADED")
      await publishAssignmentResults(source.teacherId, assignment.id, {
        ipAddress: null,
        userAgent: "local-learning-trend-demo",
      });
    const result = await prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
      select: { status: true, score: true, maxScore: true, percentage: true },
    });
    assert.equal(result.status, "PUBLISHED");
    assert.equal(result.score?.toNumber(), correctCount);
    assert.equal(result.maxScore?.toNumber(), 13);
    console.log(
      `已发布 ${result.score}/${result.maxScore} · ${result.percentage}%`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "验收样本失败");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
