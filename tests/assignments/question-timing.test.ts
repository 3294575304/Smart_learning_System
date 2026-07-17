import assert from "node:assert/strict";
import test from "node:test";

import {
  bindQuestionTimingLifecycle,
  QuestionTimingTracker,
} from "../../components/assignments/question-timing";

class CountingEventTarget extends EventTarget {
  readonly activeListeners = new Map<string, number>();

  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    super.addEventListener(type, callback, options);
    this.activeListeners.set(type, (this.activeListeners.get(type) ?? 0) + 1);
  }

  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    super.removeEventListener(type, callback, options);
    this.activeListeners.set(type, (this.activeListeners.get(type) ?? 1) - 1);
  }
}

test("tracks each question independently and resumes previous accumulated time", () => {
  let now = 0;
  const tracker = new QuestionTimingTracker(["q1", "q2"], {}, () => now);
  tracker.activate("q1");
  now = 1_000;
  tracker.activate("q2");
  now = 1_600;
  tracker.activate("q1");
  now = 2_000;

  assert.deepEqual(tracker.checkpoint(), { q1: 1_400, q2: 600 });
});

test("checkpoints return totals without counting prior intervals twice", () => {
  let now = 0;
  const tracker = new QuestionTimingTracker(["q1"], {}, () => now);
  tracker.activate("q1");
  now = 5_000;
  assert.equal(tracker.checkpoint().q1, 5_000);
  now = 8_200;
  assert.equal(tracker.checkpoint().q1, 8_200);
  now = 11_000;
  assert.equal(tracker.checkpoint().q1, 11_000);
});

test("visibility and focus lifecycle pauses and resumes timing", () => {
  let now = 0;
  let hidden = false;
  let focused = true;
  const documentTarget = new CountingEventTarget();
  const windowTarget = new CountingEventTarget();
  const tracker = new QuestionTimingTracker(["q1"], {}, () => now);
  tracker.activate("q1");
  const cleanup = bindQuestionTimingLifecycle(tracker, {
    documentTarget,
    windowTarget,
    isHidden: () => hidden,
    hasFocus: () => focused,
  });

  now = 1_000;
  hidden = true;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  now = 5_000;
  hidden = false;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  now = 6_000;
  focused = false;
  windowTarget.dispatchEvent(new Event("blur"));
  now = 9_000;
  focused = true;
  windowTarget.dispatchEvent(new Event("focus"));
  now = 10_000;

  assert.equal(tracker.checkpoint().q1, 3_000);
  cleanup();
});

test("overlapping hidden and blur reasons do not resume until both clear", () => {
  let now = 0;
  let hidden = false;
  let focused = true;
  const documentTarget = new CountingEventTarget();
  const windowTarget = new CountingEventTarget();
  const tracker = new QuestionTimingTracker(["q1"], {}, () => now);
  tracker.activate("q1");
  const cleanup = bindQuestionTimingLifecycle(tracker, {
    documentTarget,
    windowTarget,
    isHidden: () => hidden,
    hasFocus: () => focused,
  });

  now = 1_000;
  focused = false;
  windowTarget.dispatchEvent(new Event("blur"));
  hidden = true;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  now = 3_000;
  focused = true;
  windowTarget.dispatchEvent(new Event("focus"));
  now = 4_000;
  hidden = false;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  now = 5_000;

  assert.equal(tracker.checkpoint().q1, 2_000);
  cleanup();
});

test("beforeunload checkpoints and cleanup removes every listener", () => {
  let now = 0;
  let unloadSnapshot = 0;
  const documentTarget = new CountingEventTarget();
  const windowTarget = new CountingEventTarget();
  const tracker = new QuestionTimingTracker(["q1"], {}, () => now);
  tracker.activate("q1");
  const cleanup = bindQuestionTimingLifecycle(tracker, {
    documentTarget,
    windowTarget,
    isHidden: () => false,
    hasFocus: () => true,
    beforeUnload: () => {
      unloadSnapshot = tracker.snapshot().q1 ?? 0;
    },
  });

  now = 750;
  windowTarget.dispatchEvent(new Event("beforeunload"));
  assert.equal(unloadSnapshot, 750);
  cleanup();

  assert.equal(documentTarget.activeListeners.get("visibilitychange"), 0);
  assert.equal(windowTarget.activeListeners.get("focus"), 0);
  assert.equal(windowTarget.activeListeners.get("blur"), 0);
  assert.equal(windowTarget.activeListeners.get("beforeunload"), 0);
  assert.equal(tracker.getState("q1")?.activeStartedAt, null);
});
