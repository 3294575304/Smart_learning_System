import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("练习中心先展示筛选结果，再提供生成入口", async () => {
  const page = await readFile(
    "app/(protected)/student/recommendations/page.tsx",
    "utf8",
  );
  const recommendationHeading = page.indexOf(
    'id="recommendation-results-heading"',
  );
  const filters = page.indexOf("<RecommendationFilters");
  const results = page.indexOf("{result.items.length === 0");
  const pagination = page.indexOf("{result.pagination.nextCursor ?");
  const generationHeading = page.indexOf('id="generate-practice-heading"');
  const recommendationGenerator = page.indexOf("<GenerateRecommendationsForm");
  const practiceGenerator = page.indexOf("<CoursePracticeCenter");

  assert.ok(recommendationHeading >= 0 && recommendationHeading < filters);
  assert.ok(filters < results);
  assert.ok(results < pagination);
  assert.ok(pagination < generationHeading);
  assert.ok(generationHeading < recommendationGenerator);
  assert.ok(recommendationGenerator < practiceGenerator);
});

test("练习中心标题区不重复显示返回学习主页链接", async () => {
  const page = await readFile(
    "app/(protected)/student/recommendations/page.tsx",
    "utf8",
  );

  assert.match(page, /<h1 className="text-2xl font-semibold">练习中心<\/h1>/);
  assert.doesNotMatch(page, /返回学习主页/);
});
