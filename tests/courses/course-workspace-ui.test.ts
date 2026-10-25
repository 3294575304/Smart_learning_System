import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseWorkspaceNavigation } from "../../components/courses/course-workspace-navigation";
import { CourseSetupChecklist } from "../../components/courses/course-setup-checklist";
import { CourseDetailDisclosure } from "../../components/courses/course-detail-disclosure";
import {
  buildCourseSetupProgress,
  type CourseSetupInput,
} from "../../services/courses/setup-progress";

Object.assign(globalThis, { React });

function renderSetup(overrides: Partial<CourseSetupInput> = {}) {
  const progress = buildCourseSetupProgress({
    courseId: "course-a",
    status: "ACTIVE",
    activeClassroomCount: 1,
    activeStudentCount: 0,
    syllabus: { id: "file-a", versionNumber: 1, parseStatus: "SUCCEEDED" },
    publishedSyllabus: {
      id: "syllabus-a",
      syllabusId: "file-a",
      versionNumber: 1,
      graphDraftStatus: "SUCCEEDED",
    },
    graph: {
      id: "graph-a",
      sourceSyllabusStructureId: "syllabus-a",
      versionNumber: 1,
    },
    assessment: {
      sourcePublishedSyllabusStructureId: "syllabus-a",
      versionNumber: 1,
    },
    ...overrides,
  });
  return renderToStaticMarkup(
    React.createElement(CourseSetupChecklist, {
      courseId: "course-a",
      progress,
    }),
  );
}

function constructionEntries(html: string) {
  const paths: Record<string, string> = {
    "/classrooms": "classrooms",
    "/syllabus": "syllabus",
    "/knowledge-graph": "graph",
    "/assessment-scheme": "assessment",
  };
  return [
    ...html.matchAll(
      /<a\b[^>]*href="\/teacher\/courses\/course-a(\/classrooms|\/syllabus|\/knowledge-graph|\/assessment-scheme)"/g,
    ),
  ].map((match) => paths[match[1]]);
}

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
    ...new Set(
      [
        ...(html + construction).matchAll(
          /href="\/teacher\/courses\/course-a\/([a-z-]+)(?:#[^"]*)?"/g,
        ),
      ].map((match) => match[1]),
    ),
  ];
  assert.equal(
    (html.match(/href="\/teacher\/courses\/course-a\/classrooms"/g) ?? [])
      .length,
    3,
  );
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
  assert.match(html, /请先创建课程班级/u);
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
  assert.match(
    html,
    /href="\/teacher\/courses\/course-a\/syllabus"[^>]*>[\s\S]*?教学大纲[\s\S]*?未完成/u,
  );
  assert.match(
    html,
    /href="\/teacher\/courses\/course-a\/syllabus"[^>]*>[\s\S]*?查看诊断并重试/u,
  );
  assert.doesNotMatch(html, /展开详情|收起详情/u);
  assert.match(html, /href="\/teacher\/courses\/course-a\/question-mapping"/u);
  assert.doesNotMatch(
    html,
    /href="\/teacher\/courses\/course-a\/teaching-progress"/u,
  );
});

test("课程准备进度随完成情况变化，四项始终保留直接入口", () => {
  const empty = renderSetup({
    activeClassroomCount: 0,
    syllabus: null,
    publishedSyllabus: null,
    graph: null,
    assessment: null,
  });
  const partial = renderSetup({
    syllabus: null,
    publishedSyllabus: null,
    graph: null,
    assessment: null,
  });
  const complete = renderSetup();
  for (const [html, count] of [
    [empty, 0],
    [partial, 1],
  ] as const) {
    assert.match(html, new RegExp(`已完成 ${count} \\/ 4 项基础准备`, "u"));
    assert.match(html, /class="[^"]*bg-red-200" role="progressbar"/u);
    assert.match(html, /bg-red-600/u);
    assert.match(html, /<details id="course-construction-details" open=""/u);
  }
  assert.match(complete, /已完成 4 \/ 4 项基础准备/u);
  assert.doesNotMatch(complete, /role="progressbar"|bg-red-600/u);
  assert.match(complete, /<details id="course-construction-details" class=/u);
  for (const [html, detailsCount] of [
    [empty, 1],
    [partial, 2],
    [complete, 2],
  ] as const) {
    assert.equal((html.match(/<details\b/g) ?? []).length, detailsCount);
    assert.equal((html.match(/<a\b/g) ?? []).length, 6);
    assert.doesNotMatch(html, /展开详情|收起详情|data-setup-entry/u);
  }
  assert.doesNotMatch(empty, /id="course-completed-setup-details"/u);
  assert.match(
    partial,
    /<details id="course-completed-setup-details" class="group\/completed"/u,
  );
  assert.match(partial, /已完成 1 项/u);
  const completedGroup = partial.indexOf('id="course-completed-setup-details"');
  assert.ok(
    partial.indexOf('href="/teacher/courses/course-a/syllabus"') <
      completedGroup,
  );
  assert.ok(
    partial.indexOf('href="/teacher/courses/course-a/classrooms"') >
      completedGroup,
  );
  assert.match(
    complete,
    /<details id="course-completed-setup-details" class="group\/completed"/u,
  );
  assert.match(complete, /已完成 4 项/u);
  assert.deepEqual(constructionEntries(empty), [
    "classrooms",
    "syllabus",
    "graph",
    "assessment",
  ]);
  assert.deepEqual(constructionEntries(partial), [
    "syllabus",
    "graph",
    "assessment",
    "classrooms",
  ]);
  assert.deepEqual(constructionEntries(complete), [
    "classrooms",
    "syllabus",
    "graph",
    "assessment",
  ]);
  for (const [path, title] of [
    ["/classrooms", "创建课程班级"],
    ["/syllabus", "教学大纲"],
    ["/knowledge-graph", "知识图谱"],
    ["/assessment-scheme", "考核方案"],
  ]) {
    const card = [
      ...complete.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g),
    ].find((match) => match[1] === `/teacher/courses/course-a${path}`)?.[0];
    assert.ok(card, `${title}入口应保留直接链接`);
    assert.match(card, new RegExp(title, "u"));
    assert.match(card, /已完成/u);
  }
});

test("完成项排到折叠区，状态回退后重新排到前面", () => {
  const graphPending = renderSetup({ graph: null });
  assert.deepEqual(constructionEntries(graphPending), [
    "graph",
    "classrooms",
    "syllabus",
    "assessment",
  ]);
  assert.match(graphPending, /已完成 3 项/u);

  const syllabusNeedsReview = renderSetup({
    syllabus: { id: "file-b", versionNumber: 2, parseStatus: "SUCCEEDED" },
  });
  assert.deepEqual(constructionEntries(syllabusNeedsReview), [
    "syllabus",
    "classrooms",
    "graph",
    "assessment",
  ]);
  assert.match(
    syllabusNeedsReview,
    /<details id="course-construction-details" open=""/u,
  );
  assert.match(syllabusNeedsReview, /正式第 1 版继续生效/u);
});

test("题目入口独立于准备区域并始终可见，班级操作进入独立页面", () => {
  for (const html of [
    renderSetup({
      activeClassroomCount: 0,
      syllabus: null,
      publishedSyllabus: null,
      graph: null,
      assessment: null,
    }),
    renderSetup(),
  ]) {
    const toolsStart = html.indexOf(
      'aria-labelledby="course-question-tools-title"',
    );
    assert.ok(toolsStart > 0);
    const preparation = html.slice(0, toolsStart);
    const tools = html.slice(toolsStart);
    assert.doesNotMatch(
      preparation,
      /href="[^"]*(?:question-mapping|\/teacher\/questions)/u,
    );
    assert.match(
      tools,
      /href="\/teacher\/courses\/course-a\/question-mapping"/u,
    );
    assert.match(tools, /href="\/teacher\/questions\?courseId=course-a"/u);
    assert.match(
      preparation,
      /href="\/teacher\/courses\/course-a\/classrooms"/u,
    );
  }
});
test("授课班级卡片默认收起", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      CourseDetailDisclosure,
      {
        id: "course-classrooms",
        title: "授课班级",
        summary: "2 个班级",
        revealOnHash: false,
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
  assert.ok(
    courseDetail.includes("href={`/teacher/courses/${course.id}/classrooms`}"),
  );
  assert.ok(courseDetail.includes("revealOnHash={false}"));
  const dashboard = await readFile(
    "components/dashboard/teacher-workspace-cards.tsx",
    "utf8",
  );
  assert.ok(dashboard.includes("href: `${base}/classrooms`"));
  for (const path of ["classrooms", "students", "teaching-progress"]) {
    await access(`app/(protected)/teacher/courses/[courseId]/${path}/page.tsx`);
  }
});
