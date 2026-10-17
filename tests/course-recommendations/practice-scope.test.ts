import assert from "node:assert/strict";
import test from "node:test";
import {
  currentPracticeProgress,
  requiresCompletePracticePaper,
} from "../../services/course-recommendations/practice-scope";

test("自主练习允许没有授课进度，旧图谱进度不冒充当前依据", () => {
  assert.equal(currentPracticeProgress("graph-2", null), null);
  assert.equal(currentPracticeProgress("graph-2", undefined), null);
  assert.equal(
    currentPracticeProgress("graph-2", {
      graphVersionId: "graph-1",
      id: "old",
    }),
    null,
  );
  const current = { graphVersionId: "graph-2", id: "current" };
  assert.equal(currentPracticeProgress("graph-2", current), current);
});

test("练习可使用实际题量，综合测试必须完整组卷", () => {
  assert.equal(requiresCompletePracticePaper(undefined), false);
  assert.equal(requiresCompletePracticePaper("PRACTICE"), false);
  assert.equal(requiresCompletePracticePaper("TEST"), true);
});
