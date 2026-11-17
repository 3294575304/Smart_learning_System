import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentKnowledgeSummary } from "@/components/dashboard/student-knowledge-summary";
import { StudentHomeView } from "@/components/dashboard/student-home-view";
import { StudentHomeInsights } from "@/components/dashboard/student-home-insights";
import type { StudentHomePulse } from "@/services/dashboard/student-home-pulse";
import type { StudentTaskOverview } from "@/services/dashboard/student-task-overview";

Object.assign(globalThis, { React });

function overview(count = 0): StudentTaskOverview {
  const items: StudentTaskOverview["items"] = Array.from(
    { length: count },
    (_, i) => ({
      id: `a${i}`,
      kind: "assignment",
      status: "TODO",
      title: `任务 ${i}`,
      courseName: "Python",
      classroomName: "二班",
      dueAt: new Date("2026-10-28T08:00:00Z"),
      href: "/student/assignments/a?courseId=c&classroomId=k",
      action: "开始作业",
      state: "待完成",
    }),
  );
  return {
    total: count,
    counts: {
      exam: 0,
      examUpcoming: 0,
      assignment: count,
      attendance: 0,
      survey: 0,
    },
    nextChangeAt: null,
    scheduledSurveys: [],
    nextExam: null,
    pendingItems: items,
    items,
  };
}

const emptyPulse: StudentHomePulse = {
  weekly: { minutes: 0, previousMinutes: 0 },
  streak: { days: 0, longest: 0 },
  lastActiveAt: null,
  wrongBook: { open: 0, newInWeek: 0, lastReviewedAt: null },
  pendingPractice: 0,
  inProgress: [],
  finished: [],
};

const now = new Date("2026-11-15T12:00:00+08:00");

test("页头给出时间坐标、欠交份数与两个入口", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentHomeView, {
      name: "测试同学",
      now,
      overview: overview(2),
      week: 11,
    }),
  );
  assert.match(html, /周日 11-15/u);
  assert.match(html, /第 11 周/u);
  assert.match(html, /中午好，测试同学/u);
  assert.match(html, /今天还有 2 份作业没交/u);
  assert.ok(html.includes("学习计划"));
  assert.ok(html.includes("继续学习"));
  // 没有续播记录时，「继续学习」落到任务列表，而不是空链接。
  assert.match(html, /href="\/student\/tasks"[^>]*>[\s\S]*?继续学习/u);
});

test("待办列表最多四条，超出的交给全部任务入口", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentHomeInsights, {
      chapters: [],
      classes: [],
      now,
      overview: overview(8),
      pulse: emptyPulse,
    }),
  );
  assert.equal((html.match(/class="st-agenda-row /gu) ?? []).length, 4);
  assert.ok(html.includes("全部任务"));
  assert.match(html, /href="\/student\/tasks"/u);
  // 指标仍报完整待办数，不是列表里的 4 条。
  assert.match(html, /待完成作业[\s\S]*?8/u);
});

test("无待办时给出可执行的下一步，而不是空白卡片", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentHomeInsights, {
      chapters: [],
      classes: [],
      now,
      overview: overview(),
      pulse: emptyPulse,
    }),
  );
  assert.match(html, /今天没有待办/u);
  assert.match(html, /自主练习/u);
  assert.match(html, /没有待交作业/u);
  assert.doesNotMatch(html, /st-agenda-row/u);
});

test("首页与任务中心只消费同一聚合服务，首页不再加载旧图表数据", async () => {
  for (const path of [
    "app/(protected)/student/page.tsx",
    "app/(protected)/student/tasks/page.tsx",
  ]) {
    const source = await readFile(path, "utf8");
    assert.match(
      source,
      path.includes("/tasks/")
        ? /loadActivityTasks\(student.id, query\)/u
        : /getStudentTaskOverviewShared\(student.id, nowMs\)/u,
    );
    assert.doesNotMatch(
      source,
      /getStudentDashboard|listStudentAssignments|getStudentHomeTasks/u,
    );
    assert.match(source, /overview.nextChangeAt/u);
  }
  const activity = await readFile(
    "services/student-experience/activity-service.ts",
    "utf8",
  );
  assert.match(activity, /getStudentTaskOverview\(studentId, now,/u);
});

test("章节进度保留未评估与真实零分的区别，不把缺少证据计入平均", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentKnowledgeSummary, {
      chapters: [
        {
          key: "new",
          name: "未评估章节",
          concepts: [
            {
              key: "a",
              name: "尚未作答",
              status: "NO_EVIDENCE",
              evidenceCount: 0,
              masteryScore: null,
            },
          ],
        },
        {
          key: "zero",
          name: "零分章节",
          concepts: [
            {
              key: "b",
              name: "已有作答",
              status: "NEEDS_SUPPORT",
              evidenceCount: 3,
              masteryScore: 0,
            },
          ],
        },
        {
          key: "mixed",
          name: "部分评估章节",
          concepts: [
            {
              key: "c",
              name: "有证据",
              status: "DEVELOPING",
              evidenceCount: 3,
              masteryScore: 70,
            },
            {
              key: "d",
              name: "无证据",
              status: "NO_EVIDENCE",
              evidenceCount: 0,
              masteryScore: null,
            },
          ],
        },
      ],
    }),
  );
  assert.match(html, /未评估章节：证据不足，未评估/u);
  assert.match(html, /零分章节：掌握度 0%/u);
  assert.match(html, /部分评估章节：掌握度 70%/u);
  assert.match(html, /已评估 2 \/ 3 章/u);
});
