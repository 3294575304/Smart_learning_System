import assert from "node:assert/strict";
import test from "node:test";
import {
  practiceListReturnUrl,
  practiceListQuery,
} from "../../services/practice-sets/navigation";
import { wrongQuestionFilterUrl } from "../../services/wrong-questions/filter-url";
import { wrongQuestionListQuerySchema } from "../../services/wrong-questions/schemas";
test("practice return restores exact section, filters and page without accepting external paths", () => {
  const query = new URLSearchParams({
    view: "recommended",
    section: "HISTORY",
    courseId: "course1",
    keyword: "列表 & 循环",
    status: "EXPIRED",
    page: "3",
  });
  const target = practiceListReturnUrl(`/student/recommendations?${query}`);
  const result = practiceListQuery(
    new URL(target, "https://example.test").search,
  );
  assert.equal(result.success, true);
  if (result.success)
    assert.deepEqual(result.data, {
      section: "HISTORY",
      courseId: "course1",
      keyword: "列表 & 循环",
      status: "EXPIRED",
      page: 3,
    });
  for (const invalid of [
    "https://evil.test/",
    "//evil.test/",
    "/student/recommendations-other?section=TRASH",
    "/student/recommendations?page=-1",
    "/student/recommendations?section=OTHER",
  ])
    assert.equal(practiceListReturnUrl(invalid), "/student/recommendations");
});
test("review all-state survives filtering and course switch clears dependent conditions", () => {
  const query = wrongQuestionListQuerySchema.parse({
    courseId: "cmti1qeu20005yg6s1ufqyjrl",
    chapterId: "cmti1qeu20005yg6s1ufqyjra",
    page: 4,
  });
  const url = new URL(
    wrongQuestionFilterUrl(query, "courseId", "LEGACY", "列表"),
    "https://example.test",
  );
  assert.equal(url.searchParams.get("isMastered"), "all");
  assert.equal(url.searchParams.get("page"), "1");
  assert.equal(url.searchParams.get("chapterId"), null);
  assert.equal(url.searchParams.get("keyword"), "列表");
});

test("review return keeps favorite notes search and page, rejects unsafe targets", async () => {
  const { reviewReturnUrl } = await import("../../services/review/navigation");
  const target = "/student/wrong-questions?view=favorites&page=3&keyword=列表";
  assert.equal(
    new URL(reviewReturnUrl(target), "https://example.test").searchParams.get(
      "page",
    ),
    "3",
  );
  assert.equal(
    reviewReturnUrl("//evil.test/", true),
    "/student/wrong-questions?view=favorites",
  );
  assert.equal(
    reviewReturnUrl("/student/wrong-questions?view=wrong&page=-3"),
    "/student/wrong-questions?view=wrong",
  );
  assert.equal(
    reviewReturnUrl("/student/wrong-questions?view=wrong&isMastered=all"),
    "/student/wrong-questions?view=wrong&isMastered=all",
  );
});
