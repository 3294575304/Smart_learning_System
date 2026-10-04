import assert from "node:assert/strict";
import test from "node:test";
import { wrongQuestionFilterUrl } from "../../services/wrong-questions/filter-url";
import { wrongQuestionListQuerySchema } from "../../services/wrong-questions/schemas";
test("筛选保留其他条件和关键词，翻页复位，并清理课程章节依赖", () => {
  const query = wrongQuestionListQuerySchema.parse({
    courseId: "cmti1qeu20005yg6s1ufqyjrl",
    chapterId: "cmti1qeu20005yg6s1ufqyjra",
    knowledgePointId: "cmti1qeu20005yg6s1ufqyjrb",
    isMastered: false,
    page: 3,
  });
  const course = new URL(
    wrongQuestionFilterUrl(query, "courseId", "LEGACY", " 新关键词 "),
    "http://localhost",
  ).searchParams;
  assert.equal(course.get("courseId"), "LEGACY");
  assert.equal(course.get("chapterId"), null);
  assert.equal(course.get("knowledgePointId"), null);
  assert.equal(course.get("isMastered"), "false");
  assert.equal(course.get("keyword"), "新关键词");
  assert.equal(course.get("page"), "1");
  const chapter = new URL(
    wrongQuestionFilterUrl(query, "chapterId", "cmti1qeu20005yg6s1ufqyjrc", ""),
    "http://localhost",
  ).searchParams;
  assert.equal(chapter.get("courseId"), query.courseId);
  assert.equal(chapter.get("knowledgePointId"), null);
  const clear = new URL(
    wrongQuestionFilterUrl(query, "isMastered", "", ""),
    "http://localhost",
  ).searchParams;
  assert.equal(clear.has("isMastered"), false);
});
