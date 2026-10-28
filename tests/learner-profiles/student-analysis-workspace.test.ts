import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentAnalysisWorkspace } from "../../components/dashboard/student-analysis-workspace";
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
test("analysis empty state does not fabricate scores, ability or access duration", () => {
  Object.assign(globalThis, { React });
  const selected = sample();
  const html = renderToStaticMarkup(
    React.createElement(StudentAnalysisWorkspace, {
      selected,
      contexts: [selected],
      updatedAt: new Date("2026-10-29T00:00:00Z"),
    }),
  );
  assert.match(html, /等待第一份已公布成绩/);
  assert.match(html, /暂无本班出勤记录/);
  assert.doesNotMatch(html, /综合能力得分|访问总时长|累计登录次数/);
  assert.match(html, /classroomId=class/);
});
test("analysis preserves a real zero grade and separates hidden grades from the trend", () => {
  Object.assign(globalThis, { React });
  const selected = sample();
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
      percentage: 0,
      submittedAt: new Date("2026-10-28T00:00:00Z"),
    },
  ];
  selected.recent = [
    {
      id: "hidden",
      title: "尚未公布作业",
      status: "GRADED",
      percentage: null,
      submittedAt: new Date("2026-10-29T00:00:00Z"),
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(StudentAnalysisWorkspace, {
      selected,
      contexts: [selected],
      updatedAt: new Date("2026-10-29T00:00:00Z"),
    }),
  );
  assert.match(html, /已公布零分：0分/);
  assert.match(html, /仅有1项成绩/);
  assert.match(html, /待公布/);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(html, /课程画像汇总本课程证据/);
});
