import assert from "node:assert/strict";
import test from "node:test";
import {
  favoriteNoteSchema,
  favoriteSaveSchema,
  favoriteQuerySchema,
  favoritePracticeSchema,
} from "../../services/question-favorites/schemas";
import {
  favoriteUnavailableReason,
  type FavoriteAvailabilityInput,
} from "../../services/question-favorites/policy";
const base: FavoriteAvailabilityInput = {
  status: "ACTIVE",
  deletedAt: null,
  type: "TRUE_FALSE",
  explanation: "左闭右开",
  hasPermission: true,
  courseReady: true,
  hasCourseBinding: true,
  hasProgrammingConfig: true,
};
test("收藏不等于取得练习权限，撤销权限、下架和未关联正式课程知识点必须拒绝", () => {
  assert.equal(favoriteUnavailableReason(base), null);
  for (const input of [
    { hasPermission: false },
    { status: "DRAFT" },
    { deletedAt: new Date() },
    { hasCourseBinding: false },
    { courseReady: false },
    { explanation: " " },
  ])
    assert.ok(favoriteUnavailableReason({ ...base, ...input }));
});
test("编程题仍需判题配置，简答题不能绕过人工批改流程", () => {
  assert.equal(
    favoriteUnavailableReason({
      ...base,
      type: "PYTHON_PROGRAMMING",
      hasProgrammingConfig: false,
    }),
    "编程题判题配置尚未就绪",
  );
  assert.equal(
    favoriteUnavailableReason({ ...base, type: "SHORT_ANSWER" }),
    "此题型暂不支持自主练习",
  );
});
test("收藏来源只能指向已有学习入口，不能指定学生身份或虚构题目内容", () => {
  assert.equal(
    favoriteSaveSchema.safeParse({
      source: { kind: "RECOMMENDATION", id: "rec" },
    }).success,
    true,
  );
  for (const input of [
    { source: { kind: "PUBLIC", id: "q" } },
    { source: { kind: "RECOMMENDATION", id: "rec" }, studentId: "other" },
    { source: { kind: "ASSIGNMENT", id: "" } },
  ])
    assert.equal(favoriteSaveSchema.safeParse(input).success, false);
});
test("备注长度与修订、练习幂等键和筛选参数均有边界", () => {
  assert.equal(
    favoriteNoteSchema.safeParse({
      note: "x".repeat(1000),
      expectedRevision: 0,
    }).success,
    true,
  );
  assert.equal(
    favoriteNoteSchema.safeParse({
      note: "x".repeat(1001),
      expectedRevision: 0,
    }).success,
    false,
  );
  assert.equal(favoriteNoteSchema.safeParse({ note: "备注" }).success, false);
  assert.equal(
    favoritePracticeSchema.safeParse({ requestId: "fake" }).success,
    false,
  );
  for (const query of [
    { page: 0 },
    { page: 1.5 },
    { type: "other" },
    { studentId: "other" },
    { search: "x".repeat(101) },
  ])
    assert.equal(favoriteQuerySchema.safeParse(query).success, false);
  assert.equal(
    favoriteQuerySchema.parse({ page: "2", courseId: "GENERAL" }).page,
    2,
  );
});
