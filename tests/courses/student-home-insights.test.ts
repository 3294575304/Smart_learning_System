import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentHomeInsights } from "../../components/dashboard/student-home-insights";
import type { StudentClassAnalysis } from "../../services/dashboard/student-class-analytics";
import type { StudentTaskOverview } from "../../services/dashboard/student-task-overview";
const overview: StudentTaskOverview = {
  total: 0,
  counts: { assignment: 0, attendance: 0, survey: 0 },
  items: [],
  scheduledSurveys: [],
  nextChangeAt: null,
};
function item(
  id: string,
  total: number,
  submitted: number,
  status: StudentClassAnalysis["classroom"]["status"] = "ACTIVE",
): StudentClassAnalysis {
  return {
    course: {
      id: "course",
      name: "Python",
      courseNo: "001",
      term: "2026",
      status: "ACTIVE",
      teacher: { profile: null },
    },
    classroom: { id, name: `班级${id}`, status },
    total,
    submitted,
    unsubmitted: total - submitted,
    overdue: 0,
    completion: total ? Math.round((submitted / total) * 100) : null,
    average: null,
    gradedCount: 0,
    publishedCount: 0,
    awaitingRelease: submitted,
    scoreHistory: [],
    attendance: {
      total: 0,
      present: 0,
      late: 0,
      earlyLeave: 0,
      leave: 0,
      absent: 0,
      pending: 0,
    },
    recent: [],
  };
}
test("主页空看板不补造学习时长、成绩或知识评估", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentHomeInsights, { classes: [], overview }),
  );
  assert.match(html, /学习主页数据看板/);
  assert.match(html, /暂无已开放正式作业/);
  assert.match(html, /暂无待处理任务/);
  assert.doesNotMatch(html, /NaN|Infinity|学习时长|AI互动次数|累计登录/);
});
test("同名课程分别展示，结课记录不混入当前汇总，待办分布使用完整聚合", () => {
  const classes = [
    item("one", 2, 1),
    item("two", 2, 2),
    item("old", 100, 100, "ARCHIVED"),
  ];
  const html = renderToStaticMarkup(
    React.createElement(StudentHomeInsights, {
      classes,
      selected: classes[1],
      overview: {
        ...overview,
        total: 4,
        counts: { assignment: 2, attendance: 1, survey: 1 },
      },
    }),
  );
  assert.match(html, /75%/);
  assert.match(html, /已交 3\/4 项正式作业/);
  assert.match(html, /作业2项，签到1项，问卷1项/);
  assert.ok(html.includes('value="one"'));
  assert.ok(html.includes('value="two" selected=""'));
  assert.match(html, /Python · 班级one/);
  assert.match(html, /Python · 班级two/);
});
