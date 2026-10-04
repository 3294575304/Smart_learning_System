import assert from "node:assert/strict";
import test from "node:test";
import { GradeValueStatus, Prisma } from "@prisma/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CourseGradeBreakdown } from "@/components/grades/course-grade-breakdown";
import {
  calculateCourseGrade,
  type GradeCalculationComponent,
} from "@/services/gradebook/calculation";
import { presentCourseGradeComponents } from "@/services/gradebook/presentation";

function component(
  name: string,
  weight: number,
  score: number | null,
  status: GradeValueStatus = GradeValueStatus.SCORED,
): GradeCalculationComponent {
  return {
    componentId: `internal-${name}`,
    code: "ASSESS-1",
    name,
    weight: new Prisma.Decimal(weight),
    entries: [
      {
        revisionId: "internal-revision",
        gradeItemId: "internal-item",
        itemName: "后台证据名称",
        itemWeight: new Prisma.Decimal(1),
        maxScore: new Prisma.Decimal(100),
        status,
        score: score === null ? null : new Prisma.Decimal(score),
      },
    ],
  };
}

test("展示发布快照的五项占比和折合分数，与既有总评计算一致", () => {
  const grade = calculateCourseGrade(
    [
      component("平时表现", 10, 99.09),
      component("课程作业", 5, 80),
      component("期中考试", 5, 70),
      component("课程实验", 20, 65),
      component("期末考试", 60, 34.2),
    ],
    null,
  );
  const items = presentCourseGradeComponents(grade.componentResults);
  assert.equal(grade.calculatedScore?.toFixed(2), "50.93");
  assert.deepEqual(
    items.map((item) => item.actualWeight),
    ["10%", "5%", "5%", "20%", "60%"],
  );
  assert.deepEqual(
    items.map((item) => item.contribution),
    ["9.91", "4.00", "3.50", "13.00", "20.52"],
  );
  const markup = renderToStaticMarkup(
    React.createElement(CourseGradeBreakdown, {
      components: grade.componentResults,
      snapshot: { override: null },
    }),
  );
  assert.match(markup, /成绩构成/u);
  assert.match(markup, /99\.09 分/u);
  assert.match(markup, /9\.91 分/u);
  assert.doesNotMatch(
    markup,
    /<pre|ASSESS-1|internal-|后台证据名称|componentId/u,
  );
});

test("成绩未齐不当作零分，也不提高已录入项目的占比", () => {
  const grade = calculateCourseGrade(
    [
      component("作业", 40, 80),
      component("考试", 60, null, GradeValueStatus.DEFERRED),
    ],
    null,
  );
  const items = presentCourseGradeComponents(grade.componentResults);
  assert.equal(items[0]?.actualWeight, "40%");
  assert.equal(items[0]?.contribution, "32.00");
  assert.equal(items[1]?.actualWeight, "60%");
  assert.equal(items[1]?.score, null);
  assert.equal(items[1]?.contribution, null);
  const markup = renderToStaticMarkup(
    React.createElement(CourseGradeBreakdown, {
      components: grade.componentResults,
      snapshot: null,
    }),
  );
  assert.match(markup, /成绩未齐/u);
});

test("零分和缺考的折合成绩仍显示为有效的零分", () => {
  for (const status of [GradeValueStatus.SCORED, GradeValueStatus.ABSENT]) {
    const grade = calculateCourseGrade(
      [component("考试", 100, 0, status)],
      null,
    );
    const [item] = presentCourseGradeComponents(grade.componentResults);
    assert.equal(item?.score, "0.00");
    assert.equal(item?.contribution, "0.00");
  }
});

test("免修项目展示原比例与不参与状态，其余项目占比与正式计算同步归一", () => {
  const grade = calculateCourseGrade(
    [
      component("作业", 40, null, GradeValueStatus.EXEMPT),
      component("考试", 60, 80),
    ],
    null,
  );
  const items = presentCourseGradeComponents(grade.componentResults);
  assert.equal(items[0]?.weight, "40%");
  assert.equal(items[0]?.actualWeight, "0%");
  assert.equal(items[0]?.contribution, null);
  assert.equal(items[1]?.weight, "60%");
  assert.equal(items[1]?.actualWeight, "100%");
  assert.equal(items[1]?.contribution, grade.calculatedScore?.toFixed(2));
  const markup = renderToStaticMarkup(
    React.createElement(CourseGradeBreakdown, {
      components: grade.componentResults,
      snapshot: {},
    }),
  );
  assert.match(markup, /免修 \/ 不参与/u);
  assert.match(markup, /其余项目按比例重新分配占比/u);
});

test("全部免修和缺失或异常历史明细安全显示，不产生 NaN 或伪造零分", () => {
  const grade = calculateCourseGrade(
    [component("考试", 100, null, GradeValueStatus.EXEMPT)],
    null,
  );
  assert.equal(
    presentCourseGradeComponents(grade.componentResults)[0]?.contribution,
    null,
  );
  for (const invalid of [
    null,
    {},
    [],
    [{ name: "考试", weight: "无效", score: null, status: "INCOMPLETE" }],
  ]) {
    assert.deepEqual(presentCourseGradeComponents(invalid), []);
  }
  const markup = renderToStaticMarkup(
    React.createElement(CourseGradeBreakdown, {
      components: null,
      snapshot: null,
    }),
  );
  assert.match(markup, /暂无分项成绩明细/u);
  assert.doesNotMatch(markup, /NaN|Infinity/u);
});

test("总评被单独录入时明确分项仅供参考，保留原分项成绩", () => {
  const grade = calculateCourseGrade([component("考试", 100, 80)], {
    revisionId: "override",
    status: GradeValueStatus.SCORED,
    score: new Prisma.Decimal(72),
  });
  const markup = renderToStaticMarkup(
    React.createElement(CourseGradeBreakdown, {
      components: grade.componentResults,
      snapshot: { override: { score: "72.0000" } },
    }),
  );
  assert.match(markup, /80\.00 分/u);
  assert.match(markup, /以教师单独录入或导入的成绩为准/u);
  assert.match(markup, /分项折算仅供参考/u);
});
