import test from "node:test";
import assert from "node:assert/strict";
import { reviewTabHref } from "../../services/review/tab-navigation";
test("收藏与错题往返使用有效课程范围，避免夹带另一列表的筛选", () => {
  const next = new URL(
    reviewTabHref(
      "courseId=c&chapterId=h&keyword=old&page=9&backCourseId=c&backClassroomId=k",
      "favorites",
    ),
    "http://localhost",
  );
  assert.equal(next.searchParams.get("view"), "favorites");
  assert.equal(next.searchParams.get("courseId"), "c");
  assert.equal(next.searchParams.get("chapterId"), "h");
  assert.equal(next.searchParams.get("backClassroomId"), "k");
  assert.equal(next.searchParams.has("keyword"), false);
  const back = new URL(reviewTabHref(next.search, "wrong"), "http://localhost");
  assert.equal(back.searchParams.get("view"), "wrong");
  assert.equal(back.searchParams.get("courseId"), "c");
});
test("通用或历史来源不冒充可用于收藏的新课程", () => {
  for (const course of ["LEGACY", "GENERAL"]) {
    const url = new URL(
      reviewTabHref(`courseId=${course}&chapterId=old`, "favorites"),
      "http://localhost",
    );
    assert.equal(url.searchParams.has("courseId"), false);
    assert.equal(url.searchParams.has("chapterId"), false);
  }
});
