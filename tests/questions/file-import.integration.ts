import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  getTeacherQuestion,
  updateQuestion,
  listTeacherQuestions,
} from "@/services/questions/service";
import {
  questionUpsertSchema,
  questionListQuerySchema,
} from "@/services/questions/schemas";
import {
  saveManualAnswerGrade,
  completeSubmissionGrading,
} from "@/services/assignments/manual-grading";
import { prisma } from "@/lib/prisma";
import {
  previewTeacherQuestionImport,
  commitTeacherQuestionImport,
  restoreImportedProgrammingTypes,
} from "@/services/question-import/service";
import { parseQuestionImportText } from "@/services/question-import/parser";
import { getLatestProgrammingConfig } from "@/services/programming-questions/service";
import { questionImportCommitSchema } from "@/services/question-import/schemas";

async function main() {
  const teacher = await prisma.user.findFirstOrThrow({
    where: { role: "TEACHER" },
  });
  const knowledge = await prisma.knowledgePoint.findFirstOrThrow({
    where: { isActive: true },
  });
  for (const path of process.argv.slice(2)) {
    const file = new File([await readFile(path)], basename(path));
    const preview = await previewTeacherQuestionImport(teacher.id, file);
    assert.equal(preview.summary.total, 10);
    assert.equal(preview.summary.ready, 10);
    assert.ok(preview.questions.every((q) => q.type === "PYTHON_PROGRAMMING"));
    assert.ok(
      preview.questions.every(
        (q) => q.content.includes("样例输入") && q.content.includes("样例输出"),
      ),
    );
    const input = questionImportCommitSchema.parse({
      source: preview.source,
      questions: preview.questions,
      knowledgePointIds: [knowledge.id],
    });
    const result = await commitTeacherQuestionImport(teacher.id, input, {
      ipAddress: null,
      userAgent: "isolated-test",
    });
    assert.equal(result.createdCount, 10);
    const stored = await prisma.question.findMany({
      where: { id: { in: result.questionIds } },
      include: { programmingConfigRevisions: true },
    });
    assert.ok(
      stored.every(
        (q) =>
          q.status === "DRAFT" &&
          q.type === "PYTHON_PROGRAMMING" &&
          q.referenceAnswer === null &&
          q.programmingConfigRevisions.length === 0,
      ),
    );
    const owned = await listTeacherQuestions(
      teacher.id,
      questionListQuerySchema.parse({ scope: "OWNED", pageSize: 50 }),
    );
    assert.ok(
      result.questionIds.every((id) => owned.items.some((q) => q.id === id)),
    );
    const publicList = await listTeacherQuestions(
      teacher.id,
      questionListQuerySchema.parse({ scope: "PUBLIC", pageSize: 50 }),
    );
    assert.ok(
      publicList.items.every((q) => !result.questionIds.includes(q.id)),
    );
    for (const id of result.questionIds) {
      const detail = await getTeacherQuestion(teacher.id, id);
      assert.ok(detail.canEdit);
      assert.equal(detail.answer?.kind, "PROGRAMMING");
    }
    const detail = await getTeacherQuestion(
      teacher.id,
      result.questionIds[0] ?? "",
    );
    await updateQuestion(
      teacher.id,
      detail.id,
      questionUpsertSchema.parse({
        ...detail,
        knowledgePointIds: [knowledge.id],
      }),
    );
    const again = await commitTeacherQuestionImport(teacher.id, input, {
      ipAddress: null,
      userAgent: "isolated-test",
    });
    assert.equal(again.createdCount, 0);
    assert.equal(again.skippedCount, 10);
    console.log(
      `PASS ${basename(path)}: 10 recognized, 10 programming drafts and editable details, repeated import skipped, no fabricated code or tests`,
    );
  }
  const config = {
    standardCode: "n = int(input())\nprint(n * 2)\n",
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
        visibility: "PUBLIC",
        name: "公开样例",
        stdin: "2\n",
        expectedOutput: "4\n",
        points: 2,
        sortOrder: 1,
      },
      {
        visibility: "HIDDEN",
        name: "负数边界",
        stdin: "-3\n",
        expectedOutput: "-6\n",
        points: 8,
        sortOrder: 2,
      },
    ],
  };
  const configured = parseQuestionImportText(
    JSON.stringify([
      {
        title: "完整编程配置导入",
        content: "输入一个整数，输出它的两倍。",
        type: "PYTHON_PROGRAMMING",
        difficulty: 1,
        explanation: "读取整数并乘二；保留负数边界。",
        programmingConfig: config,
      },
    ]),
    "JSON",
    "编程配置.json",
  );
  assert.equal(configured[0]?.issues.length, 0);
  const configuredResult = await commitTeacherQuestionImport(
    teacher.id,
    questionImportCommitSchema.parse({
      source: { fileName: "编程配置.json", checksum: "b".repeat(64) },
      knowledgePointIds: [knowledge.id],
      questions: configured,
    }),
    { ipAddress: null, userAgent: "test" },
  );
  const configuredId = configuredResult.questionIds[0];
  assert.ok(configuredId);
  assert.equal(
    (await getTeacherQuestion(teacher.id, configuredId)).status,
    "ACTIVE",
  );
  const revision = await getLatestProgrammingConfig(teacher.id, configuredId);
  assert.ok(revision);
  assert.equal(revision.testCases.length, 2);
  const classroom = await prisma.classroom.findFirstOrThrow({
    where: { teacherId: teacher.id },
  });
  const student = await prisma.user.findFirstOrThrow({
    where: { role: "STUDENT" },
  });
  const assignment = await prisma.assignment.create({
    data: {
      teacherId: teacher.id,
      classroomId: classroom.id,
      title: "运行错误复核",
      totalPoints: 10,
      questions: {
        create: {
          questionId: configuredId,
          sortOrder: 1,
          points: 10,
          titleSnapshot: "两倍",
          contentSnapshot: "读取整数乘二",
          typeSnapshot: "PYTHON_PROGRAMMING",
          difficultySnapshot: 1,
          explanationSnapshot: "读取2分、计算6分、输出2分",
        },
      },
    },
    include: { questions: true },
  });
  const aq = assignment.questions[0];
  assert.ok(aq);
  const submission = await prisma.submission.create({
    data: {
      assignmentId: assignment.id,
      studentId: student.id,
      idempotencyKey: "programming-review-test",
      status: "PENDING_REVIEW",
      startedAt: new Date(Date.now() - 1000),
      submittedAt: new Date(),
      answers: {
        create: {
          assignmentQuestionId: aq.id,
          gradingStatus: "MANUAL_REVIEW_REQUIRED",
          score: 0,
          maxScore: 10,
          textAnswer: "n = int(input())\nprint(n * 2",
        },
      },
    },
    include: { answers: true },
  });
  const answer = submission.answers[0];
  assert.ok(answer);
  const snapshot = await prisma.assignmentProgrammingConfigSnapshot.create({
    data: {
      assignmentQuestionId: aq.id,
      configRevisionId: revision.id,
      configRevisionNumber: revision.revisionNumber,
      configurationHash: revision.configurationHash,
      testCasesHash: revision.testCasesHash,
      executorRuleVersion: revision.executorRuleVersion,
      ...revision.limits,
    },
  });
  const attempt = await prisma.programmingAttempt.create({
    data: {
      studentAnswerId: answer.id,
      assignmentQuestionId: aq.id,
      configSnapshotId: snapshot.id,
      studentId: student.id,
      createdById: student.id,
      kind: "FORMAL_JUDGE",
      revisionNumber: 1,
      sourceCode: answer.textAnswer ?? "",
      inputFingerprint: "c".repeat(64),
      ruleVersion: "test",
      status: "SUCCEEDED",
      score: 0,
      maxScore: 10,
      overallErrorType: "SYNTAX_ERROR",
      completedAt: new Date(),
    },
  });
  await assert.rejects(
    saveManualAnswerGrade(teacher.id, assignment.id, submission.id, answer.id, {
      score: 6,
      feedback: "",
    }),
  );
  await assert.rejects(
    saveManualAnswerGrade(teacher.id, assignment.id, submission.id, answer.id, {
      score: 11,
      feedback: "超分",
    }),
  );
  const reviewed = await saveManualAnswerGrade(
    teacher.id,
    assignment.id,
    submission.id,
    answer.id,
    {
      score: 6,
      feedback: "输入与计算思路正确；输出语句缺少右括号，过程给6分。",
    },
  );
  assert.equal(reviewed.answers[0]?.automaticScore, 0);
  assert.equal(reviewed.answers[0]?.manualScore, 6);
  assert.equal(
    (
      await prisma.programmingAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      })
    ).score?.toNumber(),
    0,
  );
  const completed = await completeSubmissionGrading(
    teacher.id,
    assignment.id,
    submission.id,
    { ipAddress: null, userAgent: "test" },
  );
  assert.equal(completed.score, 6);
  assert.equal(completed.status, "GRADED");
  console.log(
    "PASS atomic configured programming import, preserved machine score, explained partial credit, score bounds and completed grading",
  );
  const drafts = parseQuestionImportText(
    "第01题 入门\n编程任务\n输出输入内容\n输入格式\n文本\n输出格式\n原文",
    "TXT",
    "无评分依据.txt",
  );
  const draftResult = await commitTeacherQuestionImport(
    teacher.id,
    questionImportCommitSchema.parse({
      source: { fileName: "无评分依据.txt", checksum: "a".repeat(64) },
      knowledgePointIds: [knowledge.id],
      questions: drafts,
    }),
    { ipAddress: null, userAgent: "test" },
  );
  const draftId = draftResult.questionIds[0];
  assert.ok(draftId);
  const draft = await getTeacherQuestion(teacher.id, draftId);
  assert.equal(draft.status, "DRAFT");
  assert.ok(draft.canEdit);
  assert.equal(await getLatestProgrammingConfig(teacher.id, draftId), null);
  await updateQuestion(
    teacher.id,
    draftId,
    questionUpsertSchema.parse({ ...draft, knowledgePointIds: [knowledge.id] }),
  );
  assert.equal((await getTeacherQuestion(teacher.id, draftId)).status, "DRAFT");
  const other = await prisma.user.findFirst({
    where: { role: "TEACHER", id: { not: teacher.id } },
  });
  if (other) {
    await assert.rejects(getTeacherQuestion(other.id, draftId));
    await assert.rejects(getLatestProgrammingConfig(other.id, draftId));
  }
  assert.equal((await restoreImportedProgrammingTypes(teacher.id)).length, 0);
  console.log(
    "PASS draft detail/edit/config access, no premature activation, cross-teacher isolation",
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
