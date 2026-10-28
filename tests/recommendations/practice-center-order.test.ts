import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("练习中心先展示筛选结果，再提供生成入口", async () => {
  const page = await readFile(
    "app/(protected)/student/recommendations/page.tsx",
    "utf8",
  );
  const groupedResults = page.indexOf("<PracticeSetCenter");
  const generationHeading = page.indexOf('id="generate-practice-heading"');
  const recommendationGenerator = page.indexOf("<GenerateRecommendationsForm");
  const practiceGenerator = page.indexOf("<CoursePracticeCenter");

  assert.ok(groupedResults >= 0 && groupedResults < generationHeading);
  assert.doesNotMatch(page, /<RecommendationCard|查看下一页推荐/);
  assert.ok(generationHeading < recommendationGenerator);
  assert.ok(practiceGenerator < recommendationGenerator);
  assert.match(page, /<details[\s\S]*根据近期答题生成推荐/);
});

test("练习中心标题区不重复显示返回学习主页链接", async () => {
  const page = await readFile(
    "app/(protected)/student/recommendations/page.tsx",
    "utf8",
  );

  assert.match(page, /<StudentPageHeader[\s\S]*?title="练习中心"/);
  assert.doesNotMatch(page, /返回学习主页/);
});
