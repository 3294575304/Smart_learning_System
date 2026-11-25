import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  analyticsSearchParams,
  isAnalyticsOrigin,
  keepAnalyticsOrigin,
  withAnalyticsOrigin,
} from "@/lib/analytics-origin";

test("只把 from=analytics 当成学情分析来源", () => {
  assert.equal(isAnalyticsOrigin("analytics"), true);
  assert.equal(isAnalyticsOrigin(["analytics", "other"]), true);
  assert.equal(isAnalyticsOrigin("course"), false);
  assert.equal(isAnalyticsOrigin(undefined), false);
  assert.equal(isAnalyticsOrigin(null), false);
});

test("返回学情分析时带回课程、班级与统计范围", () => {
  assert.equal(
    analyticsSearchParams({
      courseId: "course-1",
      classroomId: "classroom-1",
      section: "CURRENT",
    }).toString(),
    "courseId=course-1&classroomId=classroom-1&section=CURRENT",
  );
  // 默认统计范围不写进地址，保持和从左侧导航进入时的干净链接一致。
  assert.equal(
    analyticsSearchParams({ courseId: "course-1", section: "ALL" }).toString(),
    "courseId=course-1",
  );
});

test("课程子页面链接带上来来源标记，并保留班级与统计范围", () => {
  assert.equal(
    withAnalyticsOrigin("/teacher/courses/course-1/profiles", {
      classroomId: "classroom-1",
      section: "HISTORY",
    }),
    "/teacher/courses/course-1/profiles?from=analytics&classroomId=classroom-1&section=HISTORY",
  );
  assert.equal(
    withAnalyticsOrigin(
      "/teacher/courses/course-1/gradebook?classroomId=classroom-1",
      {
        classroomId: "classroom-1",
      },
    ),
    "/teacher/courses/course-1/gradebook?classroomId=classroom-1&from=analytics",
  );
});

test("下一层页面只在确实来自学情分析时才继续传递来源", () => {
  assert.equal(
    keepAnalyticsOrigin(
      "/teacher/courses/course-1/students/student-1/profile?classroomId=c",
      {
        from: "analytics",
        section: "CURRENT",
      },
    ),
    "/teacher/courses/course-1/students/student-1/profile?classroomId=c&from=analytics&section=CURRENT",
  );
  assert.equal(
    keepAnalyticsOrigin(
      "/teacher/courses/course-1/students/student-1/profile",
      {
        from: undefined,
      },
    ),
    "/teacher/courses/course-1/students/student-1/profile",
  );
});

test("课程画像页按来源切换左上角返回入口", async () => {
  const page = await readFile(
    new URL(
      "../../app/(protected)/teacher/courses/[courseId]/profiles/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(page, /isAnalyticsOrigin\(query\.from\)/u);
  assert.match(
    page,
    /analyticsBackHref \?\? `\/teacher\/courses\/\$\{path\.data\.courseId\}`/u,
  );
  assert.match(page, /返回学情分析/u);
  assert.match(page, /返回课程/u);
  // 翻页与班级筛选不能把来源标记丢掉，否则返回入口会退回「返回课程」。
  assert.match(page, /params\.set\("from", "analytics"\)/u);
  assert.match(page, /name="from" type="hidden" value="analytics"/u);
});

test("学情分析里的课程子页面按钮都打上来源标记", async () => {
  const view = await readFile(
    new URL(
      "../../components/courses/teacher-course-analytics.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  for (const path of [
    "/profiles",
    "/gradebook",
    "/surveys",
    "/quality-report",
  ]) {
    assert.ok(
      view.includes(`courseSectionHref("${path}")`),
      `${path} 入口应复用带来源标记的链接`,
    );
  }
  assert.match(view, /withOrigin\(data\.evaluationNextStep\.action\.href\)/u);
});
