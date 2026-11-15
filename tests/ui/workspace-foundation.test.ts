import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageContainer, ScopeSummary } from "../../components/ui/workspace";
import { StatusBadge } from "../../components/ui/status-badge";
import { WorkflowNavigation } from "../../components/ui/workflow-navigation";
import {
  reportWorkflowStage,
  REPORT_WORKFLOW_STEPS,
} from "../../components/quality-reports/workflow";
import { CourseWorkspaceNavigation } from "../../components/courses/course-workspace-navigation";

Object.assign(globalThis, { React });

test("范围摘要保留准确的零值与文字，长名称作为文本而不是HTML", () => {
  const props = {
    label: "当前范围",
    description: "未评估不计零分",
    children: "<课程一> · 0 项任务",
  };
  const html = renderToStaticMarkup(React.createElement(ScopeSummary, props));
  assert.match(html, /&lt;课程一&gt; · 0 项任务/u);
  assert.match(html, /未评估不计零分/u);
});

test("状态同时提供文本与装饰图标，不把状态标签当交互控件", () => {
  for (const tone of [
    "neutral",
    "success",
    "warning",
    "danger",
    "info",
  ] as const) {
    const props = { tone, children: "待教师核对" };
    const html = renderToStaticMarkup(React.createElement(StatusBadge, props));
    assert.match(html, /待教师核对/u);
    assert.match(html, /aria-hidden="true"/u);
    assert.doesNotMatch(html, /role="button"/u);
  }
});

test("报告阶段只在成功且已审核时进入正式下载，失败返回准备阶段", () => {
  const cases: Array<[string, string, number]> = [
    ["QUEUED", "PENDING_REVIEW", 1],
    ["PROCESSING", "PENDING_REVIEW", 1],
    ["SUCCEEDED", "PENDING_REVIEW", 1],
    ["SUCCEEDED", "APPROVED", 2],
    ["FAILED", "APPROVED", 0],
    ["PROCESSING", "APPROVED", 1],
  ];
  assert.equal(reportWorkflowStage(null), 0);
  for (const [status, reviewStatus, stage] of cases)
    assert.equal(reportWorkflowStage({ status, reviewStatus }), stage);
  const html = renderToStaticMarkup(
    React.createElement(WorkflowNavigation, {
      steps: REPORT_WORKFLOW_STEPS,
      current: 1,
    }),
  );
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  for (const step of REPORT_WORKFLOW_STEPS)
    assert.ok(html.includes(`href="#${step.id}"`));
});

test("显式合法班级优先，日常入口携带同一班级且不重复课程建设", () => {
  const html = renderToStaticMarkup(
    React.createElement(CourseWorkspaceNavigation, {
      courseId: "course-a",
      initialClassroomId: "class-b",
      classrooms: [
        { id: "class-a", name: "一班" },
        { id: "class-b", name: "二班" },
      ],
    }),
  );
  assert.match(html, /value="class-b" selected/u);
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(
    (m) => new URL(m[1].replaceAll("&amp;", "&"), "http://local"),
  );
  assert.ok(
    links.every((url) => url.searchParams.get("classroomId") === "class-b"),
  );
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.doesNotMatch(
    html,
    /课程建设|\/syllabus|\/knowledge-graph|\/assessment-scheme/u,
  );
  assert.match(html, /向下滚动查看更多/u);
  assert.match(html, /sm:max-h-\[168px\]/u);
  assert.doesNotMatch(html, /xl:grid-cols-3/u);
});

test("容器显式选择密度和阅读宽度，不需要角色级padding补丁", () => {
  const props = {
    density: "compact",
    width: "reading",
    children: "阅读",
  } as const;
  const html = renderToStaticMarkup(React.createElement(PageContainer, props));
  assert.match(html, /data-density="compact"/u);
  assert.match(html, /max-w-4xl/u);
  assert.doesNotMatch(html, /max-w-7xl/u);
});

function luminance(hex: string) {
  const values = (hex.slice(1).match(/../g) ?? []).map((value) => {
    const v = parseInt(value, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
test("新增实色交互与状态文字令牌满足正文对比度，分组底板语义保留", async () => {
  const css = await readFile("app/globals.css", "utf8");
  const token = (name: string) => {
    const value = css.match(new RegExp(`--${name}: (#[0-9a-f]{6});`, "u"))?.[1];
    assert.ok(value, name);
    return value;
  };
  for (const [fg, bg] of [
    [token("brand"), "#ffffff"],
    [token("brand-strong"), token("brand-soft")],
    [token("success"), token("success-soft")],
    [token("warning"), token("warning-soft")],
  ]) {
    const ratio =
      (Math.max(luminance(fg), luminance(bg)) + 0.05) /
      (Math.min(luminance(fg), luminance(bg)) + 0.05);
    assert.ok(ratio >= 4.5, `${fg}/${bg}: ${ratio}`);
  }
  assert.match(css, /--surface: oklch\(0\.974 0\.013 220\)/u);
});
