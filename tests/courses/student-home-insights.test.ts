import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderWithRouter as render } from "../helpers/render-with-router";
import { StudentHomeInsights } from "../../components/dashboard/student-home-insights";
import type { StudentClassAnalysis } from "../../services/dashboard/student-class-analytics";
import type { StudentHomePulse } from "../../services/dashboard/student-home-pulse";
import type {
  StudentTaskItem,
  StudentTaskOverview,
} from "../../services/dashboard/student-task-overview";
import { StudentAssignmentRings } from "../../components/dashboard/student-assignment-rings";

const now = new Date("2026-11-15T12:00:00+08:00");

const emptyOverview: StudentTaskOverview = {
  total: 0,
  counts: { exam: 0, examUpcoming: 0, assignment: 0, attendance: 0, survey: 0 },
  items: [],
  scheduledSurveys: [],
  pendingItems: [],
  nextExam: null,
  nextChangeAt: null,
};

const emptyPulse: StudentHomePulse = {
  weekly: { minutes: 0, previousMinutes: 0 },
  streak: { days: 0, longest: 0 },
  lastActiveAt: null,
  wrongBook: { open: 0, newInWeek: 0, lastReviewedAt: null },
  pendingPractice: 0,
  inProgress: [],
  finished: [],
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
      template: { coverKey: "engineering" },
      teacher: { profile: null },
    },
    classroom: { id, name: `班级${id}`, status },
    lastClassActivityAt: 0,
    lastPracticeAt: 0,
    assignmentProgress: { total, submitted, overdue: 0 },
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
    scoreHistoryByKind: { assignment: [], exam: [] },
    practiceHistory: [],
    attendance: {
      total: 0,
      present: 0,
      late: 0,
      earlyLeave: 0,
      leave: 0,
      absent: 0,
      pending: 0,
    },
    attendanceWeek: [],
    recent: [],
  };
}

function task(
  id: string,
  kind: StudentTaskItem["kind"],
  dueAt: Date,
): StudentTaskItem {
  return {
    id: `${kind}:${id}`,
    kind,
    title: `任务${id}`,
    courseName: "Python",
    classroomName: "班级one",
    dueAt,
    status: "TODO",
    href: `/student/tasks?${id}`,
    action: "查看",
    state: "待完成",
  };
}

test("空看板不补造学习时长、连续天数或知识评估", () => {
  const html = render(
    React.createElement(StudentHomeInsights, {
      chapters: [],
      classes: [],
      now,
      overview: emptyOverview,
      pulse: emptyPulse,
    }),
  );
  assert.match(html, /学习中心数据看板/);
  assert.match(html, /待完成作业/);
  assert.match(html, /本周学习/);
  assert.match(html, /知识掌握/);
  assert.match(html, /连续学习/);
  assert.match(html, /没有待交作业/);
  assert.match(html, /本周还没有学习记录/);
  assert.match(html, /还没有可评估的知识点/);
  assert.match(html, /今天开始记录/);
  assert.match(html, /今天没有待办/);
  // 没有待办时，"待完成作业"这张卡不能着红。
  assert.doesNotMatch(html, /st-metric is-alert/);
  assert.doesNotMatch(html, /NaN|Infinity|累计登录/);
});

test("同名课程分别展示，待办数与最近截止都来自同一次统计", () => {
  const classes = [
    item("one", 2, 1),
    item("two", 2, 2),
    item("old", 100, 100, "ARCHIVED"),
  ];
  const overview: StudentTaskOverview = {
    ...emptyOverview,
    total: 2,
    counts: {
      exam: 0,
      examUpcoming: 0,
      assignment: 2,
      attendance: 0,
      survey: 0,
    },
    items: [
      task("a", "assignment", new Date("2026-11-16T23:59:00+08:00")),
      task("b", "assignment", new Date("2026-11-18T23:59:00+08:00")),
    ],
    pendingItems: [
      task("a", "assignment", new Date("2026-11-16T23:59:00+08:00")),
      task("b", "assignment", new Date("2026-11-18T23:59:00+08:00")),
    ],
  };
  const pulse: StudentHomePulse = {
    ...emptyPulse,
    weekly: { minutes: 192, previousMinutes: 168 },
    streak: { days: 9, longest: 12 },
  };
  const html = render(
    React.createElement(StudentHomeInsights, {
      chapters: [],
      classes,
      now,
      overview,
      pulse,
      selected: classes[1],
    }),
  );
  // 两张待完成作业卡：2 份、最近截止明天 23:59，且这一格着红。
  assert.match(html, /st-metric is-alert/);
  assert.match(html, /最近截止 明天 23:59/);
  // 3.2 小时、较上周 +0.4；连续 9 天、最长 12 天。
  assert.match(html, /3\.2/);
  assert.match(html, /较上周 \+0\.4/);
  assert.match(html, /最长记录 12 天/);
  // 多门课时给出课程选择器，默认选中当前课程。
  assert.ok(html.includes('value="one"'));
  assert.match(
    html,
    /<option(?=[^>]*\bvalue="two")(?=[^>]*\bselected="")[^>]*>/u,
  );
  assert.match(html, /Python · 班级one/);
  assert.match(html, /Python · 班级two/);
});

test("作业环图区分未到期、逾期和已交，无作业不显示零提交率", () => {
  const row = {
    ...item("one", 9, 6),
    lastClassActivityAt: 0,
    lastPracticeAt: 0,
    assignmentProgress: { total: 9, submitted: 6, overdue: 2 },
  };
  const html = render(
    React.createElement(StudentAssignmentRings, {
      classes: [row, item("two", 0, 0)],
    }),
  );
  assert.match(html, /已提交6项，未交未截止1项，逾期未交2项/);
  assert.match(html, /classroomId=one/);
  assert.match(html, /classroomId=two/);
  assert.match(html, /暂无作业/);
  assert.doesNotMatch(html, />0%<|NaN|Infinity/);
});
