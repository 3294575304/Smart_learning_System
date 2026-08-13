import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("自主练习页面展示结构化条件确认和自述客观隔离提示", async () => {
  const [practice, reflection, progress] = await Promise.all([
    readFile("components/recommendations/course-practice-center.tsx", "utf8"),
    readFile("components/recommendations/self-reflection-panel.tsx", "utf8"),
    readFile("components/courses/teaching-progress-panel.tsx", "utf8"),
  ]);
  assert.match(practice, /确认条件/u);
  assert.match(practice, /教学进度/u);
  assert.match(reflection, /自述与客观掌握度分开保存/u);
  assert.match(reflection, /删除/u);
  assert.match(progress, /乐观并发/u);
});
