import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {
  ScoreChart,
  StudentAnalysisWorkspace,
} from "../../components/dashboard/student-analysis-workspace";
import { TrendChart } from "../../components/dashboard/trend-chart";
import type { StudentClassAnalysis } from "../../services/dashboard/student-class-analytics";
import { renderWithRouter as render } from "../helpers/render-with-router";

test("growth shows two results as compact rows, retaining zero grades and detail links", () => {
  Object.assign(globalThis, { React });
  const score = render(
    React.createElement(ScoreChart, {
      compactSmallSample: true,
      points: [
        {
          id: "first",
          title: "文件数据统计",
          percentage: 0,
          href: "/student/submissions/first/result",
          kind: "ASSIGNMENT",
          submittedAt: new Date("2026-11-17T00:00:00Z"),
        },
        {
          id: "second",
          title: "循环与函数",
          percentage: 100,
          href: "/student/submissions/second/result",
          kind: "ASSIGNMENT",
          submittedAt: new Date("2026-11-18T00:00:00Z"),
        },
      ],
    }),
  );
  assert.match(score, /文件数据统计/);
  assert.match(score, /0 分/);
  assert.match(score, /\/student\/submissions\/second\/result/);
  assert.doesNotMatch(score, /<svg/);
  const trend = render(
    React.createElement(TrendChart, {
      compactSmallSample: true,
      showDetails: true,
      emptyMessage: "暂无记录",
      points: [{ label: "11/17", value: 88, detail: "11 月 17 日课程掌握度" }],
    }),
  );
  assert.match(trend, /11 月 17 日课程掌握度/);
  assert.match(trend, /88%/);
  assert.doesNotMatch(trend, /min-h-52/);
});
function sample(): StudentClassAnalysis {
  return {
    course: {
      id: "course",
      name: "示例课程",
      term: "2026",
      status: "ACTIVE",
      courseNo: "TEST",
      teacher: { profile: null },
      template: { coverKey: "engineering" },
    },
    classroom: { id: "class", name: "示例班", status: "ACTIVE" },
    assignmentProgress: { total: 0, submitted: 0, overdue: 0 },
    total: 0,
    submitted: 0,
    unsubmitted: 0,
    overdue: 0,
    completion: null,
    average: null,
    gradedCount: 0,
    publishedCount: 0,
    scoreHistory: [],
    scoreHistoryByKind: { assignment: [], exam: [] },
    practiceHistory: [],
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
    attendanceWeek: [],
    recent: [],
  };
}
test("analysis empty state does not fabricate scores, ability or access duration", () => {
  Object.assign(globalThis, { React });
  const selected = sample();
  const html = render(
    React.createElement(StudentAnalysisWorkspace, {
      selected,
      contexts: [selected],
      updatedAt: new Date("2026-10-29T00:00:00Z"),
    }),
  );
  assert.match(html, /等待第一份已公布成绩/);
  assert.match(html, /我还没有出勤记录/);
  assert.match(html, /暂无作业与考试记录/);
  assert.match(html, /<button[^>]*aria-expanded="false"[^>]*>查看全部/);
  assert.match(
    html,
    /href="\/student\/assignments\?courseId=course&amp;classroomId=class"[^>]*>全部作业<\/a>/,
  );
  assert.match(
    html,
    /href="\/student\/exams\?courseId=course&amp;classroomId=class"[^>]*>全部考试<\/a>/,
  );
  assert.doesNotMatch(html, /综合能力得分|访问总时长|累计登录次数/);
  assert.match(html, /classroomId=class/);
});
test("analysis preserves a real zero grade and separates hidden grades from the trend", () => {
  Object.assign(globalThis, { React });
  const selected = sample();
  selected.assignmentProgress = { total: 2, submitted: 2, overdue: 0 };
  selected.total = 2;
  selected.submitted = 2;
  selected.completion = 100;
  selected.average = 0;
  selected.gradedCount = 1;
  selected.publishedCount = 1;
  selected.awaitingRelease = 1;
  selected.scoreHistory = [
    {
      id: "published",
      title: "已公布零分",
      kind: "ASSIGNMENT",
      href: "/student/submissions/published/result",
      percentage: 0,
      submittedAt: new Date("2026-10-28T00:00:00Z"),
    },
  ];
  selected.recent = [
    {
      id: "hidden",
      title: "尚未公布作业",
      kind: "ASSIGNMENT",
      href: "/student/submissions/hidden/result",
      gradeStatus: null,
      status: "GRADED",
      percentage: null,
      submittedAt: new Date("2026-10-29T00:00:00Z"),
    },
  ];
  const html = render(
    React.createElement(StudentAnalysisWorkspace, {
      selected,
      contexts: [selected],
      updatedAt: new Date("2026-10-29T00:00:00Z"),
    }),
  );
  // 只有 1 项成绩时改为单卡直出：作业名、得分和反馈入口都在卡片里，不再渲染横轴与折线。
  assert.match(html, /最近一次已公布成绩/);
  assert.match(html, /已公布零分/);
  assert.match(html, /tabular-nums">0<span/u);
  assert.match(html, /只有 1 项已公布成绩/);
  assert.match(html, /查看成绩与教师反馈/);
  assert.doesNotMatch(html, /横轴作业名称/);
  assert.match(html, /待公布/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(html, /汇总我在这门课的评分记录/);
  assert.match(html, /我已提交全部作业/);
});

test("ended exams stay outside assignment reminders and have their own counts", () => {
  Object.assign(globalThis, { React });
  const selected = sample();
  selected.assignmentProgress = { total: 2, submitted: 2, overdue: 0 };
  selected.total = 3;
  selected.submitted = 2;
  selected.unsubmitted = 1;
  selected.overdue = 1;
  selected.completion = 67;
  const html = render(
    React.createElement(StudentAnalysisWorkspace, {
      selected,
      contexts: [selected],
      updatedAt: new Date("2026-11-16T00:00:00Z"),
    }),
  );
  assert.match(html, /我已提交全部作业/);
  assert.match(html, /作业提交率/);
  assert.match(html, /已提交 2 \/ 2 项作业/);
  assert.match(html, /已结束考试 1 场（已交卷 0 场）/);
  assert.doesNotMatch(html, /还有 1 项作业未提交/);
});

test("attendance week strip marks no-class days instead of counting them absent", () => {
  Object.assign(globalThis, { React });
  const selected = sample();
  selected.assignmentProgress = { total: 1, submitted: 1, overdue: 0 };
  selected.total = 1;
  selected.submitted = 1;
  selected.completion = 100;
  selected.attendance = {
    present: 3,
    late: 1,
    earlyLeave: 0,
    leave: 0,
    absent: 1,
    pending: 0,
    total: 5,
  };
  selected.attendanceWeek = [
    { key: "11-11", weekday: "六", status: "PRESENT" },
    { key: "11-12", weekday: "日", status: null },
    { key: "11-13", weekday: "一", status: "PRESENT" },
    { key: "11-14", weekday: "二", status: "LATE" },
    { key: "11-15", weekday: "三", status: "PRESENT" },
    { key: "11-16", weekday: "四", status: "ABSENT" },
    { key: "11-17", weekday: "五", status: null },
  ];
  const html = render(
    React.createElement(StudentAnalysisWorkspace, {
      selected,
      contexts: [selected],
      updatedAt: new Date("2026-11-17T00:00:00Z"),
    }),
  );
  // 周历条按天呈现；无课日单独标注，不并入缺勤口径。
  assert.match(html, /最近 7 天出勤/);
  assert.match(html, /周日 无课/);
  assert.match(html, /本周 5 次课/);
  assert.match(html, /灰格为无课日，不按缺勤计/);
  assert.match(html, /缺勤/);
  assert.doesNotMatch(html, /我还没有出勤记录/);
  // 建议卡固定头部给出条目数，不再用整段文字堆叠。
  assert.match(html, /接下来可以做/);
  assert.match(html, /1 项/);
});

test("practice tab stays in the course scope and never enters the score axis", () => {
  Object.assign(globalThis, { React });
  const selected = sample();
  selected.scoreHistory = [
    {
      id: "hw-1",
      title: "作业一",
      kind: "ASSIGNMENT",
      href: "/student/submissions/hw-1/result",
      percentage: 80,
      submittedAt: new Date("2026-11-10T00:00:00Z"),
    },
  ];
  selected.practiceHistory = [
    { id: "practice:11-14", label: "11/14", answered: 6, correct: 5, rate: 83 },
    { id: "practice:11-15", label: "11/15", answered: 4, correct: 2, rate: 50 },
  ];
  const html = render(
    React.createElement(StudentAnalysisWorkspace, {
      selected,
      contexts: [selected],
      updatedAt: new Date("2026-11-16T00:00:00Z"),
      initialChart: "practice",
    }),
  );
  // 练习是独立口径：柱图、按天汇总，并明确标注只统计本课程相关练习。
  assert.match(html, /本课程最近 8 个练习日的正确率/);
  assert.match(html, /11\/14/);
  assert.match(html, /合计 10 道/);
  assert.match(html, /正确率 70%/);
  assert.match(html, /只统计与本课程知识点相关的推荐练习与自主练习/);
  assert.match(html, /不计入课程成绩/);
  // 成绩序列（含 80 分作业）不应混进练习视图。
  assert.doesNotMatch(html, /作业一/);
});
