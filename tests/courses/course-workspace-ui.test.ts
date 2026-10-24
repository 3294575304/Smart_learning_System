import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseWorkspaceNavigation } from "../../components/courses/course-workspace-navigation";
import { CourseSetupChecklist } from "../../components/courses/course-setup-checklist";
import { CourseDetailDisclosure } from "../../components/courses/course-detail-disclosure";

Object.assign(globalThis, { React });
test("班级选择器仅显示关联班级，三个分类的入口都携带默认班级", () => {
  const html = renderToStaticMarkup(
    React.createElement(CourseWorkspaceNavigation, {
      courseId: "course-a",
      classrooms: [
        { id: "class-b", name: "Python 二班" },
        { id: "class-a", name: "Python 一班" },
      ],
    }),
  );
  assert.match(html, /aria-label="选择课程关联班级"/u);
  assert.match(html, /<option value="class-b" selected="">Python 二班/u);
  assert.match(html, /<option value="class-a">Python 一班/u);
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(
    (match) => new URL(match[1].replaceAll("&amp;", "&"), "http://localhost"),
  );
  assert.equal(links.length, 10);
  assert.ok(
    links.every((url) => url.searchParams.get("classroomId") === "class-b"),
  );
  assert.ok(
    links.some(
      (url) =>
        url.pathname === "/teacher/results" &&
        url.searchParams.get("courseId") === "course-a",
    ),
  );
  assert.match(html, /教学管理[\s\S]*课堂活动[\s\S]*评价分析/u);
  assert.ok(
    links.some((url) => url.pathname === "/teacher/courses/course-a/check-in"),
  );
  assert.ok(links.some((url) => url.pathname === "/teacher/assignments/new"));
  assert.ok(
    links.some(
      (url) => url.pathname === "/teacher/courses/course-a/random-picker",
    ),
  );
});

test("课程建设独立展示，大纲只有一个入口且课程功能均有对应页面", async () => {
  const html = renderToStaticMarkup(
    React.createElement(CourseWorkspaceNavigation, {
      courseId: "course-a",
      classrooms: [],
    }),
  );
  assert.match(html, /aria-selected="true"[^>]*>教学管理/u);
  assert.doesNotMatch(html, /课程建设/u);
  assert.match(html, /id="course-workspace-评价分析"[^>]*hidden/u);
  const construction = renderToStaticMarkup(
    React.createElement(CourseSetupChecklist, {
      courseId: "course-a",
      progress: {
        steps: [],
        totalCount: 0,
        completedCount: 0,
        percentage: 0,
        nextStep: null,
        archived: true,
        activeStudentCount: 0,
      },
    }),
  );
  assert.match(construction, /课程建设/u);
  assert.match(construction, /课程已归档/u);
  const paths = [
    ...(html + construction).matchAll(
      /href="\/teacher\/courses\/course-a\/([a-z-]+)(?:#[^"]*)?"/g,
    ),
  ].map((match) => match[1]);
  assert.equal(paths.length, new Set(paths).size);
  assert.equal(paths.filter((path) => path === "syllabus").length, 1);
  assert.doesNotMatch(
    construction,
    /课程信息与模板|教学进度|核对学生名单与认领/u,
  );
  assert.match(
    construction,
    /href="\/teacher\/questions\?courseId=course-a"[\s\S]*题库管理/u,
  );
  assert.ok(
    construction.indexOf("题目关联") < construction.indexOf("题库管理"),
  );
  assert.match(html, /请先关联启用中的班级/u);
  assert.doesNotMatch(html, /href="\/teacher\/assignments\/new"/u);
  const analyticsLink = [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => new URL(match[1], "http://localhost"))
    .find((url) => url.pathname === "/teacher/results");
  assert.equal(analyticsLink?.searchParams.get("courseId"), "course-a");
  for (const path of paths)
    await access(`app/(protected)/teacher/courses/[courseId]/${path}/page.tsx`);
});
test("大纲上传与审核共用卡片状态，下一步保留文字提示", () => {
  const step = {
    id: "syllabus",
    title: "教学大纲",
    state: "attention" as const,
    detail: "本次解析失败，请查看诊断并重试。",
    href: "/teacher/courses/course-a/syllabus",
    action: "查看诊断并重试",
  };
  const html = renderToStaticMarkup(
    React.createElement(CourseSetupChecklist, {
      courseId: "course-a",
      progress: {
        steps: [step],
        totalCount: 4,
        completedCount: 1,
        percentage: 25,
        nextStep: step,
        archived: false,
        activeStudentCount: 0,
      },
    }),
  );
  assert.match(html, /教学大纲/u);
  assert.match(html, /已完成/u);
  assert.match(html, /未完成/u);
  assert.match(html, /本次解析失败，请查看诊断并重试。/u);
  assert.match(html, /下一步：教学大纲/u);
  assert.match(html, /aria-valuenow="1"/u);
  assert.match(html, /aria-valuemax="4"/u);
  assert.match(html, /role="progressbar"/u);
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(hrefs.length, 5);
  assert.equal(new Set(hrefs).size, 5);
  const syllabusTasks = [
    ...html.matchAll(
      /<a\b[^>]*href="\/teacher\/courses\/course-a\/syllabus"[^>]*>[\s\S]*?<\/a>/g,
    ),
  ].map((match) => match[0]);
  assert.equal(syllabusTasks.length, 1);
  assert.match(syllabusTasks[0], /教学大纲/u);
  assert.match(syllabusTasks[0], /未完成/u);
  assert.doesNotMatch(syllabusTasks[0], /ring-2/u);
  assert.match(html, /href="\/teacher\/courses\/course-a\/question-mapping"/u);
  assert.doesNotMatch(
    html,
    /href="\/teacher\/courses\/course-a\/teaching-progress"/u,
  );
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

test("精简建设入口后仍保留课程信息、名单和教学进度页面", async () => {
  const courseDetail = await readFile(
    "app/(protected)/teacher/courses/[courseId]/page.tsx",
    "utf8",
  );
  assert.match(courseDetail, /id="course-basics"/u);
  assert.match(courseDetail, /<CourseForm/u);
  assert.match(courseDetail, /id="course-classrooms"/u);
  for (const path of ["students", "teaching-progress"]) {
    await access(`app/(protected)/teacher/courses/[courseId]/${path}/page.tsx`);
  }
});
