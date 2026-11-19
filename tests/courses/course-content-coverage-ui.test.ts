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

function renderCoverage(
  coverage: Coverage | null,
  options: {
    open?: "gaps" | "evidence" | "all";
    showAllGaps?: boolean;
    notice?: string | null;
  } = {},
) {
  return renderToStaticMarkup(
    React.createElement(CourseContentCoverage, {
      courseId: "course-a",
      coverage,
      ...options,
    }),
  );
}

function gap(index: number) {
  return {
    conceptId: `point-${index}`,
    code: `LOOP-${index}`,
    name: `知识点 ${index}`,
    chapterName: null,
    questionCount: 0,
    hasEvidence: false,
  };
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
    gaps: [gap(1)],
  });
  assert.match(
    html,
    /href="\/teacher\/questions\/new\?courseId=course-a&amp;conceptId=point-1"/,
  );
  assert.match(html, /href="\/teacher\/courses\/course-a\/question-mapping"/);
  assert.match(html, /已绑题但暂无评分证据（0 个）/);
});

test("指标以「已绑/总数」呈现，并用文字徽标说明还差多少", () => {
  const html = renderCoverage({
    ...emptyCoverage,
    graphVersion: 3,
    totals: {
      conceptCount: 4,
      boundConceptCount: 3,
      evidencedConceptCount: 1,
      bindingRate: 75,
      evidenceRate: 25,
    },
    gaps: [gap(4)],
  });
  // 主数字是比率而不是孤立个数，教师扫读即可判断还差多少。
  assert.match(html, />3<span[^>]*>\/4<\/span>/);
  assert.match(html, />1<span[^>]*>\/4<\/span>/);
  assert.match(html, /覆盖 75%/);
  assert.match(html, /覆盖 25%/);
  // 达标状态不能只靠底色灰度。
  assert.match(html, /待补 1 个/);
  assert.match(html, /待补 3 个/);
});

test("全部知识点都已绑题时给出「已达标」而不是仅变底色", () => {
  const html = renderCoverage({
    ...emptyCoverage,
    graphVersion: 3,
    totals: {
      conceptCount: 2,
      boundConceptCount: 2,
      evidencedConceptCount: 0,
      bindingRate: 100,
      evidenceRate: 0,
    },
  });
  assert.match(html, /已达标/);
  assert.match(html, /全部知识点均已绑定有效题目/);
});

test("页面明示「任一学生有证据」口径，并链接到课程画像核对", () => {
  const html = renderCoverage({
    ...emptyCoverage,
    graphVersion: 3,
    totals: {
      conceptCount: 2,
      boundConceptCount: 2,
      evidencedConceptCount: 1,
      bindingRate: 100,
      evidenceRate: 50,
    },
  });
  assert.match(html, /不代表全班均已练习/);
  assert.match(html, /href="\/teacher\/courses\/course-a\/profiles"/);
  // 模块定位必须写进界面，而不能只留在服务层注释里。
  assert.match(html, /不作为教学考核依据/);
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
  const gaps = Array.from({ length: 9 }, (_, index) => gap(index + 1));
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

test("从补题流程返回时可展开全部缺口，不再折叠", () => {
  const gaps = Array.from({ length: 9 }, (_, index) => gap(index + 1));
  const html = renderCoverage(
    {
      ...emptyCoverage,
      graphVersion: 2,
      totals: {
        ...emptyCoverage.totals,
        conceptCount: 9,
        bindingRate: 0,
        evidenceRate: 0,
      },
      gaps,
    },
    { open: "gaps", showAllGaps: true },
  );
  assert.doesNotMatch(html, /查看其余 1 个未绑题知识点/);
  assert.match(
    html,
    /href="\/teacher\/questions\/new\?courseId=course-a&amp;conceptId=point-9"/,
  );
});

test("补题成功后展示回执，教师能确认「补一个算一个」", () => {
  const html = renderCoverage(
    {
      ...emptyCoverage,
      graphVersion: 2,
      totals: {
        conceptCount: 1,
        boundConceptCount: 1,
        evidencedConceptCount: 0,
        bindingRate: 100,
        evidenceRate: 0,
      },
    },
    { notice: "已创建题目并绑定到「循环」，该知识点已计入覆盖。" },
  );
  assert.match(html, /role="status"/);
  assert.match(html, /已创建题目并绑定到「循环」/);
});

test("open=evidence 时无证据分组默认展开", () => {
  const html = renderCoverage(
    {
      ...emptyCoverage,
      graphVersion: 2,
      totals: {
        conceptCount: 2,
        boundConceptCount: 2,
        evidencedConceptCount: 1,
        bindingRate: 100,
        evidenceRate: 50,
      },
      pointsWithoutEvidence: [
        {
          conceptId: "point-loops",
          code: "LOOP",
          name: "嵌套循环",
          chapterName: null,
          questionCount: 1,
          hasEvidence: false,
        },
      ],
    },
    { open: "evidence" },
  );
  assert.match(
    html,
    /<details[^>]*\bopen\b[^>]*>\s*<summary[^>]*>已绑题但暂无评分证据/u,
  );
});
