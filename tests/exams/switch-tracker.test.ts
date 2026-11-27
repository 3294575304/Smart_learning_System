import assert from "node:assert/strict";
import test from "node:test";
import { createExamSwitchTracker } from "@/components/exams/exam-switch-tracker";

test("counts sustained window blur once and ignores a brief focus change", () => {
  const tracker = createExamSwitchTracker();
  tracker.blur(0);
  assert.equal(tracker.resume(1499, true), undefined);
  tracker.blur(2000);
  tracker.blur(3000);
  assert.equal(tracker.resume(3500, true), "WINDOW_SWITCH");
  assert.equal(tracker.resume(3501, true), undefined);
});

test("a hidden and blurred page records one departure in either event order", () => {
  for (const blurFirst of [true, false]) {
    const tracker = createExamSwitchTracker();
    if (blurFirst) tracker.blur(0);
    assert.equal(tracker.hide(), "VISIBILITY");
    if (!blurFirst) tracker.blur(0);
    assert.equal(tracker.hide(), undefined);
    assert.equal(tracker.resume(2000, false), undefined);
    assert.equal(tracker.resume(2500, true), undefined);
    assert.equal(tracker.hide(), "VISIBILITY");
  }
});
