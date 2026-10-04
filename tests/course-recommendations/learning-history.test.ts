import assert from "node:assert/strict";
import test from "node:test";
import {
  learningAssistantRequestSchema,
  savedLearningTurnsSchema,
  learningHistoryQuerySchema,
} from "../../services/learning-assistant/schemas";
const turn = {
  requestId: "d6bd68a5-deee-4d6a-b1e7-d0d8e2ab4bb4",
  question: "range 为什么不含结束值",
  phase: "QUESTION",
  createdAt: "2026-10-06T10:00:00.000Z",
  reply: {
    status: "ANSWER",
    answer: "左闭右开",
    learningObservation: "请练习验证",
    advice: [],
    objectiveSummary: "暂未评估",
    canOfferAdvice: true,
    practiceUrl: null,
    testUrl: null,
    fallbackUsed: false,
    graphVersion: 1,
    profileRevision: null,
    promptVersion: "test-v1",
    provider: "test",
    model: "test",
  },
};
test("历史对话保存问答、时间和当时版本，最多 40 轮", () => {
  assert.equal(savedLearningTurnsSchema.parse([turn])[0].reply.graphVersion, 1);
  assert.equal(
    savedLearningTurnsSchema.safeParse(Array.from({ length: 40 }, () => turn))
      .success,
    true,
  );
  assert.equal(
    savedLearningTurnsSchema.safeParse(Array.from({ length: 41 }, () => turn))
      .success,
    false,
  );
  assert.equal(
    savedLearningTurnsSchema.safeParse([{ ...turn, createdAt: "unknown" }])
      .success,
    false,
  );
  assert.equal(
    savedLearningTurnsSchema.safeParse([
      { ...turn, reply: { ...turn.reply, score: 100 } },
    ]).success,
    false,
  );
});
test("恢复会话只接受会话标识和请求 UUID，不能指定他人身份", () => {
  const input = {
    topic: { kind: "KNOWLEDGE_POINT", id: "loop" },
    text: turn.question,
    conversationId: "conversation-a",
    requestId: turn.requestId,
  };
  assert.equal(learningAssistantRequestSchema.safeParse(input).success, true);
  for (const invalid of [
    { ...input, studentId: "other" },
    { ...input, requestId: "invalid" },
    { ...input, conversationId: "" },
  ])
    assert.equal(
      learningAssistantRequestSchema.safeParse(invalid).success,
      false,
    );
});
test("历史列表分页拒绝非法页码和额外权限参数", () => {
  assert.equal(learningHistoryQuerySchema.parse({ page: "2" }).page, 2);
  assert.equal(
    learningHistoryQuerySchema.safeParse({ page: 0 }).success,
    false,
  );
  assert.equal(
    learningHistoryQuerySchema.safeParse({ page: 1, studentId: "other" })
      .success,
    false,
  );
});
