import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentCourseDashboard } from "../../components/learner-profiles/student-course-dashboard";
import { StackedKnowledge } from "../../components/learner-profiles/student-course-dashboard";
import type { StudentClassAnalysis } from "../../services/dashboard/student-class-analytics";

function sample(): StudentClassAnalysis {
  return {
    course: {
      id: "course",
      name: "示例课程",
      term: "2026",
      status: "ACTIVE",
      courseNo: "TEST",
      teacher: { profile: null },
    },
    classroom: { id: "class", name: "示例班", status: "ACTIVE" },
    total: 0,
    submitted: 0,
    unsubmitted: 0,
    overdue: 0,
    completion: null,
    average: null,
    gradedCount: 0,
    publishedCount: 0,
    scoreHistory: [],
    awaitingRelease: 0,
    attendance: {
      present: 0,
      late: 0,
      earlyLeave: 0,
      leave: 0,
      absent: 0,
      pending: 0,
      total: 0,
    },
    recent: [],
  };
}
const data = {
  heatmap: [],
  progressSteps: [
    {
      key: "teaching-progress",
      label: "教学进度",
      numerator: 0,
      denominator: 0,
      value: null,
      detail: "等待正式图谱",
    },
  ],
  nextAction: "等待更多学习证据",
};
test("复用知识分布时仍区分掌握、证据不足和未评估", () => {
  const html = renderToStaticMarkup(
    React.createElement(StackedKnowledge, {
      concepts: [
        { status: "MASTERED" },
        { status: "INSUFFICIENT" },
        { status: "NO_EVIDENCE" },
      ],
    }),
  );
  assert.match(html, /已掌握1个/);
  assert.match(html, /证据待积累1个/);
  assert.match(html, /尚未评估1个/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
test("数据面板空状态不伪造百分比、成绩或知识评估", () => {
  Object.assign(globalThis, { React });
  const html = renderToStaticMarkup(
    React.createElement(StudentCourseDashboard, { data, analysis: sample() }),
  );
  assert.match(html, /课程学习数据面板/);
  assert.match(html, /本班暂无已开放作业/);
  assert.match(html, /等待第一份已公布成绩/);
  assert.match(html, /暂无本班出勤记录/);
  assert.match(html, /暂无章节知识数据/);
  assert.doesNotMatch(html, /NaN|Infinity|综合能力得分|访问总时长/);
});
test("真实零分保留，未公布独立计数，待确认出勤不当作正常", () => {
  Object.assign(globalThis, { React });
  const analysis = sample();
  Object.assign(analysis, {
    total: 3,
    submitted: 2,
    unsubmitted: 1,
    overdue: 1,
    completion: 67,
    average: 0,
    gradedCount: 1,
    publishedCount: 1,
    awaitingRelease: 1,
  });
  analysis.attendance.pending = 1;
  analysis.attendance.total = 1;
  analysis.scoreHistory = [
    {
      id: "published",
      title: "已公布零分",
      percentage: 0,
      submittedAt: new Date("2026-10-29T00:00:00Z"),
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(StudentCourseDashboard, { data, analysis }),
  );
  assert.match(html, /已公布零分：0分/);
  assert.match(html, /已公布1项，已交待公布1项，未提交1项/);
  assert.match(html, /待确认1次，共1次/);
  assert.match(html, /正常0次，共1次/);
  assert.match(html, /仅有1项成绩，暂不判断趋势/);
  assert.match(html, /尚未评估不代表零分/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
