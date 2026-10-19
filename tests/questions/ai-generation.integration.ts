import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { PrismaClient, QuestionType } from "@prisma/client";

import {
  confirmAllQuestionCandidates,
  confirmQuestionCandidate,
  discardQuestionCandidate,
  editQuestionCandidate,
  getQuestionGenerationBatch,
  queueQuestionGeneration,
  retryQuestionGeneration,
} from "@/services/ai-question-generation/service";
import { AI_QUESTION_JOB_TYPE } from "@/services/ai-question-generation/schemas";
import { executeClaimedAIQuestionGenerationJob } from "@/services/ai-question-generation/worker";
import { claimNextBackgroundJob } from "@/services/background-jobs/repository";
import { createQuestion } from "@/services/questions/service";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();

async function main() {
  process.env.AI_PROVIDER = "mock";
  const [teacher, otherTeacher, course] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher@example.com" },
      select: { id: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { email: "teacher2@example.com" },
      select: { id: true },
    }),
    prisma.course.findFirstOrThrow({
      where: {
        teacher: { email: "teacher@example.com" },
        courseNo: "PYTHON-2026",
      },
      select: { id: true, questionCategoryId: true },
    }),
  ]);
  const original = await createQuestion(teacher.id, {
    title: `变式原题 ${randomUUID().slice(0, 8)}`,
    content: "Python 中如何把用户输入的一行文本输出到标准输出？",
    type: QuestionType.SHORT_ANSWER,
    questionCategoryId: course.questionCategoryId,
    difficulty: 3,
    options: [],
    answer: {
      kind: "REFERENCE",
      value: "使用 input() 读取，再用 print() 输出。",
    },
    explanation: "input() 读取文本，print() 输出结果。",
    tags: ["Python 输入输出"],
    knowledgePointIds: [],
  });
  const analogyInput = {
    courseId: course.id,
    mode: "ANALOGY",
    chapterCode: null,
    conceptIds: [],
    sourceQuestionId: original.id,
    bloomLevel: "APPLY",
    difficulty: 3,
    counts: { SINGLE_CHOICE: 1 },
    singleChoiceOptions: 4,
    multipleChoiceOptions: 4,
    idempotencyKey: randomUUID(),
  };
  const requested = await queueQuestionGeneration(
    teacher.id,
    analogyInput,
    null,
    {
      ipAddress: null,
      userAgent: null,
    },
  );
  assert.equal(requested.status, "PENDING");
  assert.equal(
    (
      await queueQuestionGeneration(teacher.id, analogyInput, null, {
        ipAddress: null,
        userAgent: null,
      })
    ).id,
    requested.id,
  );
  const before = await getQuestionGenerationBatch(teacher.id, requested.id);
  assert.equal(before.candidates.length, 0);
  await assert.rejects(
    getQuestionGenerationBatch(otherTeacher.id, requested.id),
    /生成任务不存在/u,
  );
  const job = await claimNextBackgroundJob({
    workerId: "ai-question-it",
    executorVersion: "ai-question-v1",
    acceptedTypes: [AI_QUESTION_JOB_TYPE],
    leaseDurationMs: 30_000,
  });
  assert.equal(job?.id, before.jobId);
  assert.ok(job?.currentLeaseId);
  await executeClaimedAIQuestionGenerationJob(
    job.id,
    job.currentLeaseId,
    requested.id,
    1,
  );
  const ready = await getQuestionGenerationBatch(teacher.id, requested.id);
  assert.equal(ready.status, "READY");
  assert.equal(ready.candidates.length, 1);
  const candidate = ready.candidates[0]!;
  await assert.rejects(
    confirmQuestionCandidate(
      otherTeacher.id,
      requested.id,
      candidate.id,
      { expectedRevision: candidate.revision },
      { ipAddress: null, userAgent: null },
    ),
    /生成任务不存在/u,
  );
  await assert.rejects(
    editQuestionCandidate(
      teacher.id,
      requested.id,
      candidate.id,
      {
        expectedRevision: candidate.revision + 1,
        question: candidate.questionJson,
        programmingConfig: null,
        sourceIds: (candidate.sourceRefs as Array<{ id: string }>).map(
          (item) => item.id,
        ),
      },
      { ipAddress: null, userAgent: null },
    ),
    /候选题已变化/u,
  );
  const revised = await editQuestionCandidate(
    teacher.id,
    requested.id,
    candidate.id,
    {
      expectedRevision: candidate.revision,
      question: {
        ...(candidate.questionJson as Record<string, unknown>),
        title: "教师审核后的变式题",
      },
      programmingConfig: null,
      sourceIds: (candidate.sourceRefs as Array<{ id: string }>).map(
        (item) => item.id,
      ),
    },
    { ipAddress: null, userAgent: null },
  );
  assert.equal(revised.revision, candidate.revision + 1);
  const history = (await getQuestionGenerationBatch(teacher.id, requested.id))
    .candidates[0]?.reviewHistory as Array<{ revision: number }>;
  assert.equal(history.length, 1);
  assert.equal(history[0]?.revision, candidate.revision);
  const confirmed = await confirmQuestionCandidate(
    teacher.id,
    requested.id,
    candidate.id,
    { expectedRevision: revised.revision, primaryConceptId: null },
    { ipAddress: null, userAgent: null },
  );
  const repeated = await confirmQuestionCandidate(
    teacher.id,
    requested.id,
    candidate.id,
    { expectedRevision: revised.revision, primaryConceptId: null },
    { ipAddress: null, userAgent: null },
  );
  assert.equal(repeated.questionId, confirmed.questionId);
  const stored = await prisma.question.findUniqueOrThrow({
    where: { id: confirmed.questionId },
    select: { status: true, questionCategoryId: true, type: true },
  });
  assert.equal(stored.status, "ACTIVE");
  assert.equal(stored.questionCategoryId, course.questionCategoryId);
  assert.equal(stored.type, QuestionType.SINGLE_CHOICE);
  await assert.rejects(
    queueQuestionGeneration(
      teacher.id,
      {
        courseId: course.id,
        mode: "RANGE",
        chapterCode: null,
        conceptIds: [],
        sourceQuestionId: null,
        bloomLevel: "REMEMBER",
        difficulty: 2,
        counts: { TRUE_FALSE: 1 },
        singleChoiceOptions: 4,
        multipleChoiceOptions: 4,
        idempotencyKey: randomUUID(),
      },
      null,
      { ipAddress: null, userAgent: null },
    ),
    /需要先发布课程知识图谱/u,
  );
  const fileBatch = await queueQuestionGeneration(
    teacher.id,
    {
      courseId: course.id,
      mode: "FILE",
      chapterCode: null,
      conceptIds: [],
      sourceQuestionId: null,
      bloomLevel: "UNDERSTAND",
      difficulty: 2,
      counts: { TRUE_FALSE: 1 },
      singleChoiceOptions: 4,
      multipleChoiceOptions: 4,
      idempotencyKey: randomUUID(),
    },
    new File(
      [
        "Python 的 print 函数把指定内容输出到标准输出。教师可以要求学生说明其作用。",
      ],
      "lesson.txt",
      { type: "text/plain" },
    ),
    { ipAddress: null, userAgent: null },
  );
  const fileJob = await claimNextBackgroundJob({
    workerId: "ai-question-file-it",
    executorVersion: "ai-question-v1",
    acceptedTypes: [AI_QUESTION_JOB_TYPE],
    leaseDurationMs: 30_000,
  });
  assert.ok(fileJob?.currentLeaseId);
  await executeClaimedAIQuestionGenerationJob(
    fileJob.id,
    fileJob.currentLeaseId,
    fileBatch.id,
    1,
  );
  const fileReady = await getQuestionGenerationBatch(teacher.id, fileBatch.id);
  assert.equal(fileReady.status, "READY");
  assert.equal(fileReady.candidates.length, 1);
  assert.match(
    JSON.stringify(fileReady.candidates[0]?.sourceRefs),
    /lesson\.txt/u,
  );
  await discardQuestionCandidate(
    teacher.id,
    fileBatch.id,
    fileReady.candidates[0]!.id,
    { expectedRevision: fileReady.candidates[0]!.revision },
    { ipAddress: null, userAgent: null },
  );
  assert.equal(
    (await getQuestionGenerationBatch(teacher.id, fileBatch.id)).candidates[0]
      ?.status,
    "DISCARDED",
  );
  const bulkBatch = await queueQuestionGeneration(
    teacher.id,
    {
      courseId: course.id,
      mode: "FILE",
      chapterCode: null,
      conceptIds: [],
      sourceQuestionId: null,
      bloomLevel: "UNDERSTAND",
      difficulty: 2,
      counts: { TRUE_FALSE: 2 },
      singleChoiceOptions: 4,
      multipleChoiceOptions: 4,
      idempotencyKey: randomUUID(),
    },
    new File(["Python 的 print 函数输出内容。"], "bulk-lesson.txt", {
      type: "text/plain",
    }),
    { ipAddress: null, userAgent: null },
  );
  const bulkJob = await claimNextBackgroundJob({
    workerId: "ai-question-bulk-it",
    executorVersion: "ai-question-v2",
    acceptedTypes: [AI_QUESTION_JOB_TYPE],
    leaseDurationMs: 30_000,
  });
  assert.ok(bulkJob?.currentLeaseId);
  await executeClaimedAIQuestionGenerationJob(
    bulkJob.id,
    bulkJob.currentLeaseId,
    bulkBatch.id,
    1,
  );
  const bulkReady = await getQuestionGenerationBatch(teacher.id, bulkBatch.id);
  assert.equal(bulkReady.status, "READY");
  assert.equal(bulkReady.candidates.length, 2);
  const bulkInput = {
    candidates: bulkReady.candidates.map((item) => ({
      id: item.id,
      expectedRevision: item.revision,
      primaryConceptId: item.primaryConceptId,
    })),
  };
  await assert.rejects(
    confirmAllQuestionCandidates(otherTeacher.id, bulkBatch.id, bulkInput, {
      ipAddress: null,
      userAgent: null,
    }),
    /生成任务不存在/u,
  );
  await assert.rejects(
    confirmAllQuestionCandidates(
      teacher.id,
      bulkBatch.id,
      {
        candidates: bulkInput.candidates.map((item) => ({
          ...item,
          expectedRevision: item.expectedRevision + 1,
        })),
      },
      { ipAddress: null, userAgent: null },
    ),
    /候选题已变化/u,
  );
  const bulkResult = await confirmAllQuestionCandidates(
    teacher.id,
    bulkBatch.id,
    bulkInput,
    { ipAddress: null, userAgent: null },
  );
  assert.equal(bulkResult.confirmedCount, 2);
  assert.equal(bulkResult.failed.length, 0);
  assert.equal(
    (
      await getQuestionGenerationBatch(teacher.id, bulkBatch.id)
    ).candidates.filter((item) => item.status === "CONFIRMED").length,
    2,
  );
  const partialBatch = await queueQuestionGeneration(
    teacher.id,
    {
      courseId: course.id,
      mode: "FILE",
      chapterCode: null,
      conceptIds: [],
      sourceQuestionId: null,
      bloomLevel: "APPLY",
      difficulty: 3,
      counts: { SHORT_ANSWER: 2 },
      singleChoiceOptions: 4,
      multipleChoiceOptions: 4,
      idempotencyKey: randomUUID(),
    },
    new File(["Python 的 len 函数返回序列长度。"], "partial-lesson.txt", {
      type: "text/plain",
    }),
    { ipAddress: null, userAgent: null },
  );
  const oldFetch = globalThis.fetch;
  const oldEnvironment = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
  };
  let allowSecond = false;
  let allowMultiple = false;
  let sawSpecificMultipleRepair = false;
  try {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "integration-test";
    process.env.AI_BASE_URL = "https://example.invalid/v1";
    process.env.AI_MODEL = "integration-test";
    globalThis.fetch = async (_url, init) => {
      const messages = JSON.parse(String(init?.body)).messages as Array<{
        content: string;
      }>;
      const isReview = messages[0]?.content.includes("独立题目审查助手");
      const input = JSON.parse(messages[1]?.content ?? "{}");
      if (
        input.type === "MULTIPLE_CHOICE" &&
        messages[0]?.content.includes("多选题至少需要两个正确选项")
      )
        sawSpecificMultipleRepair = true;
      const output = isReview
        ? {
            reviews: [
              {
                index: 0,
                factsSupported: true,
                answerConsistent: true,
                clear: true,
                difficultyAligned: true,
                reason: "已核对",
              },
            ],
          }
        : input.type === "MULTIPLE_CHOICE"
          ? {
              questions: [
                {
                  question: {
                    title: "len 函数多选题",
                    content: "下列关于 len 函数的说法，哪些正确？",
                    type: "MULTIPLE_CHOICE",
                    difficulty: 3,
                    options: [
                      {
                        label: "A",
                        content: "len('ab') 的结果是 2",
                        sortOrder: 1,
                      },
                      {
                        label: "B",
                        content: "len('ab') 的结果是 3",
                        sortOrder: 2,
                      },
                      {
                        label: "C",
                        content: "len([]) 的结果是 0",
                        sortOrder: 3,
                      },
                      {
                        label: "D",
                        content: "len([]) 的结果是 1",
                        sortOrder: 4,
                      },
                    ],
                    answer: {
                      kind: "CHOICE",
                      correctOptionLabels: allowMultiple ? ["A", "C"] : ["A"],
                    },
                    explanation: "len 返回序列长度，因此 A 和 C 正确。",
                    tags: ["序列长度"],
                  },
                  programmingConfig: null,
                  sourceIds: [input.evidence[0].id],
                  primaryConceptId: null,
                },
              ],
            }
          : input.sequence === 2 && !allowSecond
            ? { questions: [] }
            : {
                questions: [
                  {
                    question: {
                      title: `序列长度题 ${input.sequence}`,
                      content: `字符串 s = 'abc'，请说明 len(s) 的结果，并解释原因。题号 ${input.sequence}`,
                      type: "SHORT_ANSWER",
                      difficulty: 3,
                      options: [],
                      answer: {
                        kind: "REFERENCE",
                        value: "结果为 3，因为字符串包含三个字符。",
                      },
                      explanation: "len 返回字符串中的字符数量。",
                      tags: ["字符串长度"],
                    },
                    programmingConfig: null,
                    sourceIds: [input.evidence[0].id],
                    primaryConceptId: null,
                  },
                ],
              };
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify(output) },
              finish_reason: "stop",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };
    const partialJob = await claimNextBackgroundJob({
      workerId: "ai-question-partial-it",
      executorVersion: "ai-question-v2",
      acceptedTypes: [AI_QUESTION_JOB_TYPE],
      leaseDurationMs: 30_000,
    });
    assert.ok(partialJob?.currentLeaseId);
    await executeClaimedAIQuestionGenerationJob(
      partialJob.id,
      partialJob.currentLeaseId,
      partialBatch.id,
      1,
    );
    const partial = await getQuestionGenerationBatch(
      teacher.id,
      partialBatch.id,
    );
    assert.equal(partial.status, "PARTIAL");
    assert.equal(partial.generatedCount, 1);
    assert.equal(partial.failedCount, 1);
    assert.equal(
      (partial.failureDetails as Array<{ ordinal: number }>)[0]?.ordinal,
      2,
    );
    const firstCandidateId = partial.candidates[0]?.id;
    allowSecond = true;
    await retryQuestionGeneration(teacher.id, partialBatch.id);
    const retryJob = await claimNextBackgroundJob({
      workerId: "ai-question-retry-it",
      executorVersion: "ai-question-v2",
      acceptedTypes: [AI_QUESTION_JOB_TYPE],
      leaseDurationMs: 30_000,
    });
    assert.ok(retryJob?.currentLeaseId);
    await executeClaimedAIQuestionGenerationJob(
      retryJob.id,
      retryJob.currentLeaseId,
      partialBatch.id,
      2,
    );
    const completed = await getQuestionGenerationBatch(
      teacher.id,
      partialBatch.id,
    );
    assert.equal(completed.status, "READY");
    assert.equal(completed.candidates.length, 2);
    assert.equal(completed.candidates[0]?.id, firstCandidateId);
    assert.equal((completed.failureDetails as unknown[]).length, 0);
    const multipleBatch = await queueQuestionGeneration(
      teacher.id,
      {
        courseId: course.id,
        mode: "FILE",
        chapterCode: null,
        conceptIds: [],
        sourceQuestionId: null,
        bloomLevel: "REMEMBER",
        difficulty: 3,
        counts: { MULTIPLE_CHOICE: 1 },
        singleChoiceOptions: 4,
        multipleChoiceOptions: 4,
        idempotencyKey: randomUUID(),
      },
      new File(["Python 的 len 函数返回序列长度。"], "multiple-lesson.txt", {
        type: "text/plain",
      }),
      { ipAddress: null, userAgent: null },
    );
    const multipleJob = await claimNextBackgroundJob({
      workerId: "ai-question-multiple-it",
      executorVersion: "ai-question-v2",
      acceptedTypes: [AI_QUESTION_JOB_TYPE],
      leaseDurationMs: 30_000,
    });
    assert.ok(multipleJob?.currentLeaseId);
    await executeClaimedAIQuestionGenerationJob(
      multipleJob.id,
      multipleJob.currentLeaseId,
      multipleBatch.id,
      1,
    );
    const multipleFailed = await getQuestionGenerationBatch(
      teacher.id,
      multipleBatch.id,
    );
    assert.equal(multipleFailed.status, "FAILED");
    assert.match(
      JSON.stringify(multipleFailed.failureDetails),
      /多选题至少需要两个正确选项/u,
    );
    assert.equal(sawSpecificMultipleRepair, true);
    allowMultiple = true;
    await retryQuestionGeneration(teacher.id, multipleBatch.id);
    const multipleRetryJob = await claimNextBackgroundJob({
      workerId: "ai-question-multiple-retry-it",
      executorVersion: "ai-question-v2",
      acceptedTypes: [AI_QUESTION_JOB_TYPE],
      leaseDurationMs: 30_000,
    });
    assert.ok(multipleRetryJob?.currentLeaseId);
    await executeClaimedAIQuestionGenerationJob(
      multipleRetryJob.id,
      multipleRetryJob.currentLeaseId,
      multipleBatch.id,
      2,
    );
    const multipleReady = await getQuestionGenerationBatch(
      teacher.id,
      multipleBatch.id,
    );
    assert.equal(multipleReady.status, "READY");
    assert.equal(multipleReady.candidates.length, 1);
    assert.deepEqual(
      (
        multipleReady.candidates[0]?.questionJson as {
          answer: { correctOptionLabels: string[] };
        }
      ).answer.correctOptionLabels,
      ["A", "C"],
    );
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exitCode = 1;
});
