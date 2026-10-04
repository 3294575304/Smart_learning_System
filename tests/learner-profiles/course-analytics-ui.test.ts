import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("教师课程分析中心执行角色、课程归属与状态聚合", async () => {
  const [page, service, view, navigation] = await Promise.all([
    readFile(
      new URL(
        "../../app/(protected)/teacher/courses/[courseId]/analytics/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../services/course-analytics/service.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/courses/teacher-course-analytics.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/courses/course-workspace-navigation.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(page, /requirePageRole\(Role\.TEACHER\)/u);
  assert.match(page, /courseIdSchema\.safeParse/u);
  assert.match(page, /ResourceNotFoundError/u);
  assert.match(service, /where: \{ id: courseId, teacherId \}/u);
  assert.match(service, /AttendanceSessionStatus\.CLOSED/u);
  assert.match(service, /currentPublishedKnowledgeGraphVersion/u);
  assert.match(service, /currentTeachingProgressRevision/u);
  assert.match(service, /nextActions/u);
  assert.match(view, /本阶段教学待办/u);
  assert.match(view, /掌握情况与需要关注的知识点/u);
  assert.match(view, /课程评价闭环/u);
  assert.match(navigation, /title: "课程分析中心"/u);
  assert.match(navigation, /path: "analytics"/u);
});
