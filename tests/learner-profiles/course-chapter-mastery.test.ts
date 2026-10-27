import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CourseChapterMastery } from "../../components/courses/course-chapter-mastery";
import type { CourseChapterMasterySummary } from "../../services/course-analytics/metrics";

Object.assign(globalThis, { React });

function chapter(
  score: number | null,
  index: number,
): CourseChapterMasterySummary {
  return {
    chapterId: `chapter-${index}`,
    code: `CH-${index}`,
    name: `第${index}章`,
    conceptCount: 2,
    averageMastery: score,
    evidenceStudentCount: 1,
    assessedStudentCount: score === null ? 0 : 1,
    stableEntryCount: score === null ? 0 : 2,
    totalEntryCount: 6,
  };
}

test("章节条按60和80分边界分色，默认全部可滚动查看并移除展开按钮", () => {
  const scores = [0, 59.9, 60, 79.9, 80, 100];
  const html = renderToStaticMarkup(
    React.createElement(CourseChapterMastery, {
      chapters: scores.map(chapter),
      studentCount: 3,
    }),
  );
  const rows = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gu)].map(
    (match) => match[1] ?? "",
  );
  assert.equal(rows.length, 6);
  assert.match(html, /全部章节掌握度，按从低到高排列，可滚动查看/u);
  assert.match(html, /tabindex="0"/u);
  assert.doesNotMatch(html, /<button|展开其余|收起其余/u);
  for (const [index, color] of [
    "rose",
    "rose",
    "amber",
    "amber",
    "emerald",
    "emerald",
  ].entries()) {
    assert.match(rows[index] ?? "", new RegExp(`bg-${color}-500`, "u"));
    assert.match(
      rows[index] ?? "",
      new RegExp(`aria-valuenow="${scores[index]}"`, "u"),
    );
  }
  assert.match(rows[0] ?? "", /width:0%/u);
  assert.doesNotMatch(rows[0] ?? "", /width:3%/u);
  assert.match(html, /1\/3 名学生可评估/u);
  assert.match(html, /稳定覆盖 2\/6 项/u);
  assert.match(html, /低掌握度章节优先显示/u);
});

test("未评估与证据不足用灰色标记，不显示0%或有数值的进度条", () => {
  const insufficient = chapter(null, 1);
  const missing = { ...chapter(null, 2), evidenceStudentCount: 0 };
  const html = renderToStaticMarkup(
    React.createElement(CourseChapterMastery, {
      chapters: [insufficient, missing],
      studentCount: 3,
    }),
  );
  assert.match(html, /证据不足/u);
  assert.match(html, /未评估/u);
  assert.match(html, /bg-slate-100/u);
  assert.doesNotMatch(html, /role="progressbar"|aria-valuenow=/u);
  assert.doesNotMatch(html, /<button/u);
});

test("未发布正式章节时提供恢复指引", () => {
  const html = renderToStaticMarkup(
    React.createElement(CourseChapterMastery, {
      chapters: [],
      studentCount: 0,
    }),
  );
  assert.match(html, /暂无可汇总的正式章节/u);
  assert.match(html, /发布包含章节归属的正式知识图谱/u);
});
