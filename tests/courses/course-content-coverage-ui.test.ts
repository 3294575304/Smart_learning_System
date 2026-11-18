import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CourseContentCoverage } from "../../components/courses/course-content-coverage";
import type { CourseContentCoverage as Coverage } from "../../services/courses/content-coverage";

Object.assign(globalThis, { React });

const emptyCoverage: Coverage = {
  course: { id: "course-a", name: "Python 程序设计" },
  graphVersion: null,
  totals: {
    conceptCount: 0,
    boundConceptCount: 0,
    evidencedConceptCount: 0,
    bindingRate: null,
    evidenceRate: null,
  },
  chapters: [],
  gaps: [],
  pointsWithoutEvidence: [],
  canRemediate: 0,
};

function renderCoverage(coverage: Coverage | null) {
  return renderToStaticMarkup(
    React.createElement(CourseContentCoverage, {
      courseId: "course-a",
      coverage,
    }),
  );
}

test("课程还没有正式知识图谱时，提供图谱入口", () => {
  const html = renderCoverage(emptyCoverage);
  assert.match(html, /当前还没有正式知识图谱版本/);
  assert.match(html, /href="\/teacher\/courses\/course-a\/knowledge-graph"/);
});

test("正式图谱没有知识点时，展示该版本及补充指引", () => {
  const html = renderCoverage({ ...emptyCoverage, graphVersion: 2 });
  assert.match(html, /正式图谱 v2 暂无知识点/);
  assert.match(html, /添加知识点并发布图谱/);
  assert.doesNotMatch(html, /覆盖 0%/);
});

test("补题入口携带具体课程和知识点，页面保留批量关联入口", () => {
  const html = renderCoverage({
    ...emptyCoverage,
    graphVersion: 2,
    totals: {
      ...emptyCoverage.totals,
      conceptCount: 1,
      bindingRate: 0,
      evidenceRate: 0,
    },
    gaps: [
      {
        conceptId: "point-a",
        code: "LOOP",
        name: "循环",
        chapterName: null,
        questionCount: 0,
        hasEvidence: false,
      },
    ],
  });
  assert.match(
    html,
    /href="\/teacher\/questions\/new\?courseId=course-a&amp;conceptId=point-a"/,
  );
  assert.match(html, /href="\/teacher\/courses\/course-a\/question-mapping"/);
  assert.match(html, /已绑题但暂无评分证据（0 个）/);
});

test("有题但暂无评分证据的知识点可展开，并精确链接到已绑定的题目", () => {
  const html = renderCoverage({
    ...emptyCoverage,
    graphVersion: 2,
    totals: {
      conceptCount: 2,
      boundConceptCount: 2,
      evidencedConceptCount: 1,
      bindingRate: 100,
      evidenceRate: 50,
    },
    chapters: [
      {
        key: "loops",
        name: "循环结构",
        conceptCount: 2,
        boundConceptCount: 2,
        evidencedConceptCount: 1,
      },
    ],
    pointsWithoutEvidence: [
      {
        conceptId: "point-loops",
        code: "LOOP",
        name: "嵌套循环",
        chapterName: "循环结构",
        questionCount: 2,
        hasEvidence: false,
      },
    ],
  });
  assert.match(html, /<summary[^>]*>已绑题但暂无评分证据（1 个）<\/summary>/);
  assert.match(html, /循环结构 · 2 道有效题目/);
  assert.match(
    html,
    /href="\/teacher\/courses\/course-a\/knowledge-graph\?conceptId=point-loops"/,
  );
  assert.match(html, /按章节查看覆盖/);
  assert.match(html, /<summary[^>]*>统计口径<\/summary>/);
  assert.match(html, /两项覆盖率都以这些知识点的总数为分母/);
  assert.match(html, /任一学生在本课程的最新掌握度记录/);
  assert.doesNotMatch(html, /学生能在每个知识点上积累评分证据/);
});

test("未绑题知识点超过首屏条数时，其余条目仍可定位和创建", () => {
  const gaps = Array.from({ length: 9 }, (_, index) => ({
    conceptId: `point-${index + 1}`,
    code: `LOOP-${index + 1}`,
    name: `知识点 ${index + 1}`,
    chapterName: null,
    questionCount: 0,
    hasEvidence: false,
  }));
  const html = renderCoverage({
    ...emptyCoverage,
    graphVersion: 2,
    totals: {
      ...emptyCoverage.totals,
      conceptCount: 9,
      bindingRate: 0,
      evidenceRate: 0,
    },
    gaps,
  });
  assert.match(html, /<summary[^>]*>查看其余 1 个未绑题知识点<\/summary>/);
  assert.match(
    html,
    /href="\/teacher\/questions\/new\?courseId=course-a&amp;conceptId=point-9"/,
  );
});
