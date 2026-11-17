import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PracticeHistoryQuestion } from "../../components/recommendations/practice-history-question";
import { RecommendationPracticeSet } from "../../components/recommendations/recommendation-practice-set";
import { canAnswerPractice } from "../../services/practice-sets/types";
import type { RecommendationDetailView } from "../../services/recommendations/types";
import type { PracticeSet } from "../../services/practice-sets/types";
Object.assign(globalThis, { React });
function detail(): RecommendationDetailView {
  return {
    id: "old",
    questionId: "q",
    title: "历史题目",
    content: "这里是保留的题干",
    type: "TRUE_FALSE",
    knowledgePoints: [],
    reason: "review",
    status: "EXPIRED",
    createdAt: "2026-10-01T00:00:00Z",
    expiresAt: null,
    startedAt: null,
    completedAt: null,
    options: [],
    practiceResult: null,
    savedAnswer: null,
    readOnly: true,
  };
}
test("ended questions retain content and explicitly mark unanswered without write controls", () => {
  const html = renderToStaticMarkup(
    React.createElement(PracticeHistoryQuestion, { item: detail() }),
  );
  assert.match(html, /这里是保留的题干/);
  assert.match(html, /未作答，未保存答案/);
  assert.match(html, /只读/);
  assert.doesNotMatch(html, /<input|<textarea|<button|参考答案/);
});
test("saved code is escaped and retained in read-only history", () => {
  const item = {
    ...detail(),
    type: "PYTHON_PROGRAMMING" as const,
    savedAnswer: 'print("<script>alert(1)</script>")',
  };
  const html = renderToStaticMarkup(
    React.createElement(PracticeHistoryQuestion, { item }),
  );
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
test("choice review marks option IDs only when graded feedback exists", () => {
  const item: RecommendationDetailView = {
    ...detail(),
    type: "SINGLE_CHOICE",
    options: [
      { id: "a", label: "A", content: "相同选项文本", sortOrder: 0 },
      { id: "b", label: "B", content: "相同选项文本", sortOrder: 1 },
    ],
  };
  const render = (view: RecommendationDetailView) =>
    renderToStaticMarkup(
      React.createElement(PracticeHistoryQuestion, { item: view }),
    );
  assert.doesNotMatch(render(item), /正确答案|你的选择/);
  const html = render({
    ...item,
    historyFeedback: {
      questionId: "q",
      title: "历史题目",
      studentAnswer: "A. 相同选项文本",
      correctAnswer: "B. 相同选项文本",
      choiceFeedback: { selectedOptionIds: ["a"], correctOptionIds: ["b"] },
      explanation: "根据选项 ID 标注判分结果。",
      recommendationReason: "review",
      isCorrect: false,
      score: 0,
      maxScore: 10,
      responseTimeMs: null,
    },
  });
  assert.match(html, />A<.*你的选择.*>B<.*正确答案/);
  assert.match(html, /答案解析/);
});
test("an expired seven-question group has readable content and no obsolete submit UI", () => {
  const item = detail();
  const set: PracticeSet = {
    id: item.id,
    courseId: "course",
    courseName: "Python",
    title: "课程专项练习",
    generatedAt: item.createdAt,
    status: "EXPIRED",
    total: 7,
    completed: 0,
    entryId: item.id,
    knowledgePoints: [],
    questions: Array.from({ length: 7 }, (_, i) => ({
      id: i === 0 ? item.id : `old${i}`,
      title: "历史题目",
      type: "TRUE_FALSE",
      status: "EXPIRED",
      readOnly: true,
    })),
  };
  const html = renderToStaticMarkup(
    React.createElement(RecommendationPracticeSet, {
      set,
      initialRecommendation: item,
    }),
  );
  assert.match(html, /这里是保留的题干/);
  assert.match(html, /暂无已评成绩/);
  assert.doesNotMatch(
    html,
    /提交全部练习|草稿仅保存|可先跳题|无法继续作答|尚非最终成绩|练习提交进度/,
  );
});
test("mixed groups only allow pending and started available questions", () => {
  assert.equal(canAnswerPractice({ status: "PENDING" }), true);
  assert.equal(canAnswerPractice({ status: "STARTED", readOnly: true }), false);
  for (const status of ["EXPIRED", "COMPLETED", "DISMISSED"] as const)
    assert.equal(canAnswerPractice({ status }), false);
});

test("submitted programming review retains both panels with judging details below", () => {
  const item: RecommendationDetailView = {
    ...detail(),
    type: "PYTHON_PROGRAMMING",
    status: "COMPLETED",
    savedAnswer: "print(42)",
    programmingAttempt: {
      id: "attempt-12345678",
      status: "SUCCEEDED",
      progress: 100,
    },
    programmingSamples: [
      { name: "公开样例", stdin: "1", expectedOutput: "42" },
    ],
  };
  const html = renderToStaticMarkup(
    React.createElement(PracticeHistoryQuestion, { item }),
  );
  assert.match(html, /题目说明/);
  assert.match(html, /main\.py/);
  assert.match(html, /已提交 · 只读/);
  assert.match(html, /公开检查点/);
  assert.match(html, /Python 正式判题/);
  assert.ok(html.indexOf("Python 正式判题") > html.indexOf("main.py"));
  assert.doesNotMatch(html, /提交本题判题|未保存检测点记录/);
});
