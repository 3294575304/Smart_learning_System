import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseWorkspaceNavigation } from "../../components/courses/course-workspace-navigation";
import { CourseSetupChecklist } from "../../components/courses/course-setup-checklist";
import { CourseDetailDisclosure } from "../../components/courses/course-detail-disclosure";

Object.assign(globalThis, { React });
test("课程首页默认教学管理，建设和分析分组隐藏，所有功能入口有对应页面", async () => {
  const html = renderToStaticMarkup(
    React.createElement(CourseWorkspaceNavigation, { courseId: "course-a" }),
  );
  assert.match(html, /aria-selected="true"[^>]*>教学管理/u);
  assert.match(html, /id="course-workspace-课程建设"[^>]*hidden/u);
  assert.match(html, /id="course-workspace-评价分析"[^>]*hidden/u);
  const paths = [
    ...html.matchAll(/href="\/teacher\/courses\/course-a\/([a-z-]+)"/g),
  ].map((match) => match[1]);
  assert.equal(paths.length, 12);
  assert.equal(new Set(paths).size, 12);
  for (const path of paths)
    await access(`app/(protected)/teacher/courses/[courseId]/${path}/page.tsx`);
});
test("准备明细默认收起，下一步可操作，进度保持可读", () => {
  const step = {
    id: "progress",
    title: "设置教学进度",
    state: "pending" as const,
    detail: "保存当前已授内容",
    href: "/teacher/courses/course-a/teaching-progress",
    action: "设置教学进度",
  };
  const html = renderToStaticMarkup(
    React.createElement(CourseSetupChecklist, {
      progress: {
        steps: [step],
        totalCount: 1,
        completedCount: 0,
        percentage: 0,
        nextStep: step,
        archived: false,
        activeStudentCount: 0,
      },
    }),
  );
  assert.match(html, /查看准备明细/u);
  assert.doesNotMatch(html, /<details[^>]*\bopen/u);
  assert.match(html, /role="progressbar"/u);
  assert.match(html, /href="\/teacher\/courses\/course-a\/teaching-progress"/u);
});
test("班级与课程设置默认收起并保留深链接锚点", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      CourseDetailDisclosure,
      {
        id: "course-classrooms",
        title: "授课班级",
        summary: "2 个班级",
      },
      "管理内容",
    ),
  );
  assert.match(html, /<details id="course-classrooms"/u);
  assert.doesNotMatch(html, /<details[^>]*\bopen/u);
  assert.match(html, /展开管理/u);
});
