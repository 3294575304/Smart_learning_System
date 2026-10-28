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

test("首页按优先任务、待办、常用入口排列，移除跨课程图表", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentHomeView, {
      name: "测试同学",
      overview: overview(1),
    }),
  );
  assert.ok(html.indexOf("当前优先任务") < html.indexOf("我的待办"));
  assert.ok(html.indexOf("我的待办") < html.indexOf("常用入口"));
  for (const label of [
    "我的课程",
    "练习中心",
    "复习中心",
    "我的成绩",
    "查看学习分析",
    "查看全部任务",
  ])
    assert.ok(html.includes(label));
  assert.doesNotMatch(
    html,
    /平均正确率|最近成绩|薄弱知识点|AI 推荐练习|<svg[^>]+role="img"/u,
  );
  assert.match(html, /Python · 二班/u);
  assert.match(html, /16:00/u); // Shanghai timezone, independent of host timezone.
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
  assert.match(html, /当前没有待处理任务/u);
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
