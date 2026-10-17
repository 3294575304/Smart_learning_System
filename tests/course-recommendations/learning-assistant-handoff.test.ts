import assert from "node:assert/strict";
import test from "node:test";
import { suggestLearningPractice } from "../../services/learning-assistant/context";
import { savedLearningTurnSchema } from "../../services/learning-assistant/schemas";
const course = {
  courseId: "python",
  graphVersionNumber: 2,
  concepts: [{ id: "c1", code: "KP-1", name: "变量" }],
  chapters: [3, 1, 2, 4].map((n) => ({
    id: `ch${n}`,
    code: `CH-${n}`,
    name: `第${n}章 基础${n}`,
    conceptIds: ["c1"],
  })),
};
const topic = { kind: "COURSE" as const, id: "python" };
test("前几章请求明确提示默认前三章并按章节顺序传递，基础练习使用难度2", () => {
  const plan = suggestLearningPractice(
    course,
    topic,
    "基础不太牢，想去前面几章练习",
  );
  assert.ok(plan);
  const url = new URL(plan.practiceUrl, "https://test.local");
  assert.deepEqual(url.searchParams.getAll("chapterId"), ["ch1", "ch2", "ch3"]);
  assert.equal(url.searchParams.get("difficulty"), "2");
  assert.equal(plan.count, 20);
  assert.match(plan.note, /前 3 章/u);
  assert.equal(url.pathname, "/student/recommendations");
});
test("无授权主题代码和模糊问句不会猜测范围，明确知识点可直接提供确认入口", () => {
  assert.equal(
    suggestLearningPractice(course, topic, "随便问问", "foreign"),
    null,
  );
  const plan = suggestLearningPractice(course, topic, "变量是什么？", "KP-1");
  assert.ok(plan);
  assert.equal(
    new URL(plan.practiceUrl, "https://test.local").searchParams.get(
      "conceptId",
    ),
    "c1",
  );
  assert.equal(
    suggestLearningPractice(course, { kind: "CHAPTER", id: "foreign" }, "练习"),
    null,
  );
});
test("新旧对话记录均兼容，确认建议可持久化且不允许任意附加字段", () => {
  const reply = {
    status: "ANSWER",
    answer: "可以练习",
    learningObservation: "",
    advice: [],
    objectiveSummary: "",
    canOfferAdvice: false,
    practiceUrl: null,
    testUrl: null,
    fallbackUsed: false,
    graphVersion: 2,
    profileRevision: null,
    promptVersion: "v3",
    provider: null,
    model: null,
  };
  const turn = {
    requestId: "e7a01b1f-d28d-4bba-90a6-00daf6064828",
    question: "变量",
    phase: "QUESTION",
    createdAt: "2026-10-10T00:00:00.000Z",
    reply,
  };
  assert.equal(savedLearningTurnSchema.safeParse(turn).success, true);
  assert.equal(
    savedLearningTurnSchema.safeParse({
      ...turn,
      reply: {
        ...reply,
        practiceSuggestion: suggestLearningPractice(
          course,
          topic,
          "变量",
          "KP-1",
        ),
      },
    }).success,
    true,
  );
});

test("指定章节序号不会扩大到整个课程", () => {
  const plan = suggestLearningPractice(course, topic, "我想练第2章的判断题");
  assert.ok(plan);
  const url = new URL(plan.practiceUrl, "https://test.local");
  assert.deepEqual(url.searchParams.getAll("chapterId"), ["ch2"]);
  assert.equal(plan.count, 10);
});
