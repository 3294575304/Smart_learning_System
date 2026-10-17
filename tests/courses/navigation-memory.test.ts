import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePageMemory,
  rememberedReturnUrl,
} from "../../components/dashboard/navigation-memory-state";
const now = 100_000_000;
const saved = {
  at: now,
  y: 800,
  url: "/student/assignments?courseId=course&classroomId=class&page=2",
  details: ["成绩来源"],
};
test("返回原列表恢复班级与页码，其他资源不能复用", () => {
  assert.equal(
    rememberedReturnUrl(saved, "/student/assignments", now),
    saved.url,
  );
  assert.equal(rememberedReturnUrl(saved, "/teacher/assignments", now), null);
  assert.equal(
    rememberedReturnUrl(
      { ...saved, url: "/student/assignments" },
      "/student/assignments",
      now,
    ),
    null,
  );
});
test("过期、损坏和外部地址的记忆均不恢复", () => {
  for (const value of [
    null,
    {},
    { ...saved, y: -1 },
    { ...saved, y: NaN },
    { ...saved, at: 0 },
    { ...saved, at: now + 1 },
    { ...saved, details: [42] },
    { ...saved, url: "https://example.com/student/assignments" },
    { ...saved, url: "//example.com" },
    { ...saved, url: "/login" },
  ])
    assert.equal(parsePageMemory(value, now), null);
  assert.deepEqual(parsePageMemory(saved, now), saved);
});
