import assert from "node:assert/strict";
import test from "node:test";

import { QuestionType } from "@prisma/client";

import { MockAIProvider } from "@/services/ai/mock-provider";
import { OpenAICompatibleProvider } from "@/services/ai/openai-compatible";
import {
  generatedQuestionsOutputSchema,
  questionGenerationRequestSchema,
  questionReviewOutputSchema,
  type QuestionGenerationAIInput,
} from "@/services/ai-question-generation/schemas";
import { questionUpsertSchema } from "@/services/questions/schemas";

const courseId = "ccourse000000000000000001";
const categoryId = "ccategory00000000000000001";

function request(mode: "RANGE" | "ANALOGY" | "FILE" = "RANGE") {
  return {
    courseId,
    mode,
    chapterCode: null,
    conceptIds: [],
    sourceQuestionId: mode === "ANALOGY" ? "cquestion000000000000001" : null,
    bloomLevel: "APPLY",
    difficulty: 3,
    counts: { SINGLE_CHOICE: 1 },
    singleChoiceOptions: 4,
    multipleChoiceOptions: 4,
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  };
}

test("三种模式与六类题型遵守题量、原题和选项边界", () => {
  for (const mode of ["RANGE", "ANALOGY", "FILE"] as const)
    assert.equal(
      questionGenerationRequestSchema.safeParse(request(mode)).success,
      true,
    );
  assert.equal(
    questionGenerationRequestSchema.safeParse({
      ...request("ANALOGY"),
      sourceQuestionId: null,
    }).success,
    false,
  );
  assert.equal(
    questionGenerationRequestSchema.safeParse({
      ...request(),
      counts: { SINGLE_CHOICE: 11 },
    }).success,
    false,
  );
  assert.equal(
    questionGenerationRequestSchema.safeParse({
      ...request(),
      counts: { SINGLE_CHOICE: 10, MULTIPLE_CHOICE: 10, TRUE_FALSE: 1 },
    }).success,
    false,
  );
  assert.equal(
    questionGenerationRequestSchema.safeParse({
      ...request(),
      singleChoiceOptions: 7,
    }).success,
    false,
  );
});

test("Mock Provider 的六类候选符合现有题目与编程配置契约", async () => {
  const provider = new MockAIProvider();
  for (const type of Object.values(QuestionType)) {
    const input: QuestionGenerationAIInput = {
      mode: "RANGE",
      courseName: "Python 程序设计",
      type,
      count: 1,
      sequence: 1,
      difficulty: 3,
      bloomLevel: "APPLY",
      optionCount:
        type === QuestionType.SINGLE_CHOICE ||
        type === QuestionType.MULTIPLE_CHOICE
          ? 4
          : null,
      evidence: [
        { id: "GRAPH:one", locator: "第一章", text: "Python 变量与表达式" },
      ],
      sourceQuestion: null,
      concepts: [{ id: courseId, name: "Python 变量与表达式" }],
    };
    const generated = generatedQuestionsOutputSchema.parse(
      await provider.generateQuestions(input, {
        signal: AbortSignal.timeout(1_000),
      }),
    );
    const candidate = generated.questions[0];
    assert.ok(candidate);
    assert.equal(
      questionUpsertSchema.safeParse({
        ...candidate.question,
        questionCategoryId: categoryId,
        knowledgePointIds: [],
      }).success,
      true,
      type,
    );
    assert.equal(
      Boolean(candidate.programmingConfig),
      type === QuestionType.PYTHON_PROGRAMMING,
    );
    assert.deepEqual(candidate.sourceIds, ["GRAPH:one"]);
    assert.equal(candidate.primaryConceptId, courseId);
    const reviewed = questionReviewOutputSchema.parse(
      await provider.reviewGeneratedQuestions(
        {
          type,
          difficulty: 3,
          evidence: input.evidence,
          draftText: JSON.stringify(candidate),
          count: 1,
        },
        { signal: AbortSignal.timeout(1_000) },
      ),
    );
    assert.equal(reviewed.reviews[0]?.answerConsistent, true);
  }
});

test("外部 Provider 仅发送经清理、限长的证据片段与原题摘录", async () => {
  const originalFetch = globalThis.fetch;
  let sent = "";
  globalThis.fetch = async (_url, init) => {
    sent = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify({ questions: [] }) },
            finish_reason: "stop",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test",
      baseUrl: "https://example.invalid/v1",
      model: "test",
    });
    await provider.generateQuestions(
      {
        mode: "ANALOGY",
        courseName: "Python 程序设计",
        type: QuestionType.SINGLE_CHOICE,
        count: 1,
        sequence: 1,
        difficulty: 3,
        bloomLevel: "APPLY",
        optionCount: 4,
        evidence: [
          {
            id: "one",
            locator: "第一章",
            text: `学生邮箱 a@example.com，手机号 13812345678。${"材料".repeat(2_000)}`,
          },
        ],
        sourceQuestion: { title: "原题", content: "学号 12345678901 的学生" },
        concepts: [],
      },
      { signal: AbortSignal.timeout(1_000) },
    );
    assert.ok(!sent.includes("a@example.com"));
    assert.ok(!sent.includes("13812345678"));
    assert.ok(!sent.includes("12345678901"));
    assert.ok(sent.length < 6_000);
    const choicePrompt = JSON.parse(sent).messages[0].content as string;
    assert.ok(choicePrompt.includes('"kind":"CHOICE"'));
    assert.ok(choicePrompt.includes("恰好有 4 个选项"));
    assert.ok(choicePrompt.includes("primaryConceptId"));

    await provider.generateQuestions(
      {
        mode: "RANGE",
        courseName: "Python 程序设计",
        type: QuestionType.PYTHON_PROGRAMMING,
        count: 1,
        sequence: 1,
        difficulty: 3,
        bloomLevel: "APPLY",
        optionCount: null,
        evidence: [{ id: "one", locator: "第一章", text: "Python 输入输出" }],
        sourceQuestion: null,
        concepts: [],
      },
      { signal: AbortSignal.timeout(1_000) },
    );
    const programmingPrompt = JSON.parse(sent).messages[0].content as string;
    assert.ok(programmingPrompt.includes('"kind":"PROGRAMMING"'));
    assert.ok(programmingPrompt.includes('"visibility":"PUBLIC"'));
    assert.ok(programmingPrompt.includes('"visibility":"HIDDEN"'));

    await provider.generateQuestions(
      {
        mode: "RANGE",
        courseName: "Python 程序设计",
        type: QuestionType.MULTIPLE_CHOICE,
        count: 1,
        sequence: 5,
        difficulty: 3,
        bloomLevel: "REMEMBER",
        optionCount: 4,
        evidence: [{ id: "one", locator: "第一章", text: "Python 序列长度" }],
        sourceQuestion: null,
        concepts: [],
      },
      {
        signal: AbortSignal.timeout(1_000),
        validationError: "answer: 多选题至少需要两个正确选项",
      },
    );
    const multiplePrompt = JSON.parse(sent).messages[0].content as string;
    assert.ok(multiplePrompt.includes("两个由证据支持且彼此独立的正确选项"));
    assert.ok(multiplePrompt.includes("answer: 多选题至少需要两个正确选项"));
    assert.ok(multiplePrompt.includes("不能退化成单选题"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
