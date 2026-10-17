import assert from "node:assert/strict";
import test from "node:test";
import { learningAssistantRequestSchema } from "../../services/learning-assistant/schemas";
import {
  resolveAuthorizedLearningTopic,
  resolveSuggestedPracticeTopic,
  learningPracticeLinks,
} from "../../services/learning-assistant/context";
import { answerLearningQuestion } from "../../services/learning-assistant/ai";
import type { AIProvider } from "../../services/ai/provider";

const courses = [
  {
    courseId: "python",
    courseName: "Python 程序设计",
    graphVersionNumber: 2,
    chapters: [],
    concepts: [
      { id: "loop", code: "KP-5-1", name: "while循环" },
      { id: "list", code: "KP-3-5", name: "列表" },
    ],
  },
];
const topic = { kind: "COURSE" as const, id: "python" };
test("直接问答使用整个已授权课程，不能以课程级主题绕过归属校验", () => {
  const request = learningAssistantRequestSchema.parse({
    topic,
    text: "循环怎么用？",
  });
  const context = resolveAuthorizedLearningTopic(
    courses,
    "python",
    request.topic,
  );
  assert.deepEqual(context.conceptIds, ["loop", "list"]);
  assert.equal(context.topic.name, "Python 程序设计");
  assert.throws(
    () =>
      resolveAuthorizedLearningTopic(courses, "python", {
        kind: "COURSE",
        id: "foreign",
      }),
    /课程不存在/,
  );
  assert.throws(
    () => resolveAuthorizedLearningTopic(courses, "foreign", topic),
    /课程不存在/,
  );
});
test("AI 候选只能解析为当前课程正式知识点，不明确时不跳转随机练习", () => {
  assert.deepEqual(resolveSuggestedPracticeTopic(courses[0], topic, "KP-5-1"), {
    kind: "KNOWLEDGE_POINT",
    id: "loop",
  });
  for (const code of [null, undefined, "FOREIGN", "loop"])
    assert.equal(resolveSuggestedPracticeTopic(courses[0], topic, code), null);
  const specified = { kind: "KNOWLEDGE_POINT" as const, id: "list" };
  assert.deepEqual(
    resolveSuggestedPracticeTopic(courses[0], specified, "KP-5-1"),
    specified,
  );
  assert.doesNotMatch(
    learningPracticeLinks("python", topic, true).practiceUrl ?? "",
    /conceptId|chapterId/,
  );
});
test("课程直接答疑保留合法 AI 识别结果并清理越界代码，澄清回复无需伪造学习建议", async () => {
  const input = {
    topic,
    text: "循环怎么用？",
    history: [],
    phase: "ADVICE" as const,
    topicName: "Python",
    topicDescription: "",
    masteryOverview: "暂未评估",
    concepts: [{ code: "KP-5-1", name: "while循环", description: "条件循环" }],
  };
  const provider: AIProvider = {
    name: "test-provider",
    model: "test-model",
    analyzeStudentPerformance: async () => ({}),
    parseSyllabus: async () => ({}),
    answerCourseLearningQuestion: async () => ({
      status: "ANSWER",
      answer: "请说明你想练习的方向。",
      learningObservation: "",
      advice: [],
      topicCode: "OTHER-COURSE",
    }),
  };
  const clarification = await answerLearningQuestion(provider, input);
  assert.equal(clarification.fallbackUsed, false);
  assert.equal(clarification.output.topicCode, null);
  provider.answerCourseLearningQuestion = async () => ({
    status: "ANSWER",
    answer: "while 循环在条件满足时重复执行。",
    learningObservation: "",
    advice: ["先检查循环结束条件"],
    topicCode: "KP-5-1",
  });
  const answer = await answerLearningQuestion(provider, input);
  assert.equal(answer.output.topicCode, "KP-5-1");
  assert.equal(answer.fallbackUsed, false);
});
