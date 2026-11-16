import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentRecentLearning } from "@/components/dashboard/student-recent-learning";
import { StudentHomeAgenda } from "../../components/dashboard/student-home-agenda";
import type { StudentHomePulse } from "../../services/dashboard/student-home-pulse";
import type {
  StudentTaskItem,
  StudentTaskOverview,
} from "../../services/dashboard/student-task-overview";

Object.assign(globalThis, { React });

const now = new Date("2026-11-15T12:00:00+08:00");

function assignment(id: string, dueAt: string, title: string): StudentTaskItem {
  return {
    id: `assignment:${id}`,
    kind: "assignment",
    title,
    courseName: "Python 程序设计",
    classroomName: "python 2班",
    dueAt: new Date(dueAt),
    status: "TODO",
    href: `/student/assignments/${id}`,
    action: "开始作业",
    state: "待完成",
  };
}

const overdue = assignment(
  "a1",
  "2026-11-14T18:00:00+08:00",
  "单元测验一 · 循环",
);
const doing = assignment(
  "a2",
  "2026-11-16T23:59:00+08:00",
  "实验五 · 函数与递归",
);

const overview = {
  total: 2,
  counts: { exam: 0, examUpcoming: 0, assignment: 2, attendance: 0, survey: 0 },
  items: [overdue, doing],
  pendingItems: [overdue, doing],
  nextExam: null,
  scheduledSurveys: [],
  nextChangeAt: null,
} satisfies StudentTaskOverview;

const pulse: StudentHomePulse = {
  weekly: { minutes: 120, previousMinutes: 90 },
  streak: { days: 3, longest: 9 },
  lastActiveAt: new Date("2026-11-15T10:00:00+08:00"),
  wrongBook: { open: 12, newInWeek: 4, lastReviewedAt: null },
  pendingPractice: 0,
  inProgress: [
    {
      submissionId: "s2",
      assignmentId: "a2",
      title: "实验五 · 函数与递归",
      courseName: "Python 程序设计",
      answered: 2,
      total: 6,
      lastSavedAt: new Date("2026-11-15T11:30:00+08:00"),
      savedAt: new Date("2026-11-15T11:30:00+08:00"),
      href: "/student/submissions/s2/answer",
    },
  ],
  finished: [
    {
      submissionId: "s1",
      assignmentId: "a0",
      title: "随堂练习 · 文件读写",
      courseName: "Python 程序设计",
      score: 92,
      maxScore: 100,
      submittedAt: new Date("2026-11-13T20:00:00+08:00"),
      graded: true,
      href: "/student/assignments/a0",
    },
  ],
};

const html = renderToStaticMarkup(
  React.createElement(StudentHomeAgenda, { now, overview, pulse }),
);

test("逾期行给红字天数与补交按钮，语气与其他行不同", () => {
  assert.match(html, /is-overdue/u);
  assert.match(html, /已逾期 1 天/u);
  assert.match(html, /立即补交/u);
  assert.match(html, /单元测验一 · 循环/u);
});

test("在做的作业报出进度，并接到草稿而不是作业说明页", () => {
  assert.match(html, /已答 2 \/ 6 题/u);
  assert.match(html, /继续做题/u);
  assert.ok(html.includes('href="/student/submissions/s2/answer"'));
});

test("已提交记录独立展示，不混入今日待办", () => {
  const recent = renderToStaticMarkup(
    React.createElement(StudentRecentLearning, { finished: pulse.finished }),
  );
  assert.doesNotMatch(html, /随堂练习 · 文件读写/u);
  assert.match(recent, /最近学习/u);
  assert.match(recent, /随堂练习 · 文件读写/u);
  assert.match(recent, /92/u);
  assert.match(recent, /11-13/u);
  assert.match(recent, /href="\/student\/assignments\/a0"/u);
});

test("底部续做条接最近一次未完成的作答", () => {
  assert.match(html, /上次做到/u);
  assert.match(html, /实验五 · 函数与递归 · 第 3 题/u);
  assert.match(html, /接着做/u);
});

test("最近学习保留待批改状态，不伪造零分；无记录显示空状态", () => {
  const waiting = renderToStaticMarkup(
    React.createElement(StudentRecentLearning, {
      finished: pulse.finished.map((item) => ({
        ...item,
        graded: false,
        score: null,
      })),
    }),
  );
  assert.match(waiting, /已交，等待批改/u);
  assert.doesNotMatch(waiting, /st-recent-score/u);
  const empty = renderToStaticMarkup(
    React.createElement(StudentRecentLearning, { finished: [] }),
  );
  assert.match(empty, /还没有已提交的学习记录/u);
});
