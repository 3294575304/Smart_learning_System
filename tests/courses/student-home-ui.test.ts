import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentHomeView } from "@/components/dashboard/student-home-view";
import type { StudentTaskOverview } from "@/services/dashboard/student-task-overview";

Object.assign(globalThis, { React });
function overview(count = 0): StudentTaskOverview {
  return {
    total: count,
    counts: { assignment: count, attendance: 0, survey: 0 },
    nextChangeAt: null,
    scheduledSurveys: [],
    items: Array.from({ length: count }, (_, i) => ({
      id: `a${i}`,
      kind: "assignment",
      title: `任务 ${i}`,
      courseName: "Python",
      classroomName: "二班",
      dueAt: new Date("2026-10-28T08:00:00Z"),
      href: `/student/assignments/a${i}?courseId=c&classroomId=k`,
      action: "开始作业",
      state: "待完成",
    })),
  };
}

test("首页合并待办，优先任务只出现一次，保留两个学习入口", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentHomeView, {
      name: "测试同学",
      overview: overview(1),
    }),
  );
  for (const label of ["自主练习", "我的题库", "查看全部任务", "优先处理"])
    assert.ok(html.includes(label));
  assert.equal((html.match(/>任务 0</gu) ?? []).length, 1);
  assert.match(html, /aria-label="待办分布：共 1 项，作业 1、签到 0、问卷 0"/u);
  assert.doesNotMatch(
    html,
    /待办事项分布|当前优先任务|常用入口|练习中心|复习中心/u,
  );
  assert.match(html, /Python · 二班/u);
  assert.match(html, /16:00/u);
});

test("首页仅展示五项列表但保留完整待办数和全部任务入口", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentHomeView, {
      name: "同学",
      overview: overview(8),
    }),
  );
  assert.equal((html.match(/<li\b/gu) ?? []).length, 5);
  assert.match(html, /其余 3 项/u);
  assert.match(html, /href="\/student\/tasks"/u);
  assert.match(html, /我的待办/u);
  assert.match(html, /8/u);
});

test("无待办时显示课程入口和正常空状态，待开放问卷独立说明", () => {
  const data = overview();
  data.scheduledSurveys.push({
    id: "q",
    title: "预约问卷",
    opensAt: new Date("2026-10-28T00:00:00Z"),
    courseName: "Python",
    classroomName: "二班",
    href: "/student/surveys/q",
  });
  const html = renderToStaticMarkup(
    React.createElement(StudentHomeView, { name: "同学", overview: data }),
  );
  assert.match(html, /暂无待办/u);
  // 零待办时收敛成一行状态，不再渲染 0 项的分布环图。
  assert.doesNotMatch(html, /aria-label="待办分布/u);
  assert.match(html, /进入我的课程/u);
  assert.match(html, /暂不计入待办/u);
  assert.match(html, /不计入成绩/u);
  assert.match(html, /问卷开放预告/u);
});

test("首页与任务中心只消费同一聚合服务，首页不再加载旧图表数据", async () => {
  for (const path of [
    "app/(protected)/student/page.tsx",
    "app/(protected)/student/tasks/page.tsx",
  ]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /getStudentTaskOverview\(student.id(?:,\s*now)?\)/u);
    assert.doesNotMatch(
      source,
      /getStudentDashboard|listStudentAssignments|getStudentHomeTasks/u,
    );
    assert.match(source, /overview.nextChangeAt/u);
  }
});
