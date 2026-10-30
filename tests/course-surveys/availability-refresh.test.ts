import assert from "node:assert/strict";
import test from "node:test";
import {
  bindAvailabilityRefresh,
  type AvailabilityRefreshRuntime,
} from "@/components/course-surveys/availability-refresh-lifecycle";

function fixture() {
  let now = Date.parse("2026-10-27T10:00:00Z");
  let hidden = false;
  let count = 0;
  const intervals: Array<{
    callback: () => void;
    delay: number;
    canceled: boolean;
  }> = [];
  const timeouts: typeof intervals = [];
  const runtime: AvailabilityRefreshRuntime = {
    now: () => now,
    hidden: () => hidden,
    every(callback, delay) {
      const entry = { callback, delay, canceled: false };
      intervals.push(entry);
      return () => {
        entry.canceled = true;
      };
    },
    after(callback, delay) {
      const entry = { callback, delay, canceled: false };
      timeouts.push(entry);
      return () => {
        entry.canceled = true;
      };
    },
    focus: new EventTarget(),
    visibility: new EventTarget(),
  };
  return {
    runtime,
    intervals,
    timeouts,
    refresh: () => {
      count++;
    },
    get count() {
      return count;
    },
    advance: (ms: number) => {
      now += ms;
    },
    setHidden: (value: boolean) => {
      hidden = value;
    },
  };
}

test("普通轮询和焦点事件合并，时间边界不会被刚发生的刷新抑制", () => {
  const f = fixture();
  const cleanup = bindAvailabilityRefresh(
    new Date(f.runtime.now() + 1000).toISOString(),
    f.refresh,
    f.runtime,
  );
  assert.equal(f.intervals[0].delay, 30_000);
  assert.equal(f.timeouts[0].delay, 1250);
  f.advance(900);
  f.runtime.focus.dispatchEvent(new Event("focus"));
  f.runtime.visibility.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.count, 1);
  f.advance(350);
  f.timeouts[0].callback();
  assert.equal(f.count, 2, "boundary bypasses ordinary-event throttle");
  f.advance(1000);
  f.intervals[0].callback();
  assert.equal(f.count, 3);
  cleanup();
});

test("隐藏页面不刷新，恢复可见后刷新，清理会撤销计时器与事件订阅", () => {
  const f = fixture();
  const cleanup = bindAvailabilityRefresh(
    new Date(f.runtime.now() + 1000).toISOString(),
    f.refresh,
    f.runtime,
  );
  f.setHidden(true);
  f.timeouts[0].callback();
  f.intervals[0].callback();
  assert.equal(f.count, 0);
  f.setHidden(false);
  f.runtime.visibility.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.count, 1);
  cleanup();
  f.advance(2000);
  f.runtime.focus.dispatchEvent(new Event("focus"));
  f.runtime.visibility.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.count, 1);
  assert.ok(f.intervals[0].canceled && f.timeouts[0].canceled);
});

test("无有效时间边界仍轮询，远期时间不会溢出浏览器计时器", () => {
  for (const at of [null, "invalid"]) {
    const f = fixture();
    const cleanup = bindAvailabilityRefresh(at, f.refresh, f.runtime);
    assert.equal(f.timeouts.length, 0);
    f.intervals[0].callback();
    assert.equal(f.count, 1);
    cleanup();
  }
  const f = fixture();
  const cleanup = bindAvailabilityRefresh(
    "2030-01-01T00:00:00Z",
    f.refresh,
    f.runtime,
  );
  assert.equal(f.timeouts[0].delay, 2_147_483_647);
  cleanup();
});
