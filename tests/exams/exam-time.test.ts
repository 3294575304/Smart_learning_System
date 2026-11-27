import assert from "node:assert/strict";
import test from "node:test";

import {
  examDurationMinutes,
  examTermKey,
  examTermLabel,
  formatExamWindow,
} from "../../services/exams/exam-time";

// 统一用北京时间构造，避免本地时区影响断言。
const at = (iso: string) => new Date(`${iso}+08:00`);

test("学期键按开学口径划分：1 月归上一学年秋季", () => {
  assert.equal(examTermKey(at("2026-01-15T09:00:00")), "2025-秋");
  assert.equal(examTermKey(at("2026-02-01T09:00:00")), "2026-春");
  assert.equal(examTermKey(at("2026-07-31T09:00:00")), "2026-春");
  assert.equal(examTermKey(at("2026-08-01T09:00:00")), "2026-秋");
  assert.equal(examTermKey(at("2026-12-31T09:00:00")), "2026-秋");
});

test("学期标签与键一致", () => {
  assert.equal(examTermLabel(at("2026-03-01T09:00:00")), "2026 学年春季学期");
  assert.equal(examTermLabel(at("2026-11-01T09:00:00")), "2026 学年秋季学期");
});

test("考试时长按分钟取整，倒挂时间归零", () => {
  assert.equal(
    examDurationMinutes(at("2026-11-13T09:00:00"), at("2026-11-13T11:30:00")),
    150,
  );
  assert.equal(
    examDurationMinutes(at("2026-11-13T10:00:00"), at("2026-11-13T09:00:00")),
    0,
  );
});

test("同一天的时间窗只重复一次日期，跨天各带日期", () => {
  const now = at("2026-11-13T08:00:00");
  assert.equal(
    formatExamWindow(at("2026-11-13T09:00:00"), at("2026-11-13T11:00:00"), now),
    "今天 09:00–11:00",
  );
  assert.equal(
    formatExamWindow(at("2026-11-13T23:00:00"), at("2026-11-14T01:00:00"), now),
    "今天 23:00 – 明天 01:00",
  );
});
