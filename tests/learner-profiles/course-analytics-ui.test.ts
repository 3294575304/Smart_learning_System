import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("统一成绩统计中心复用课程学情并保留课程权限范围", async () => {
  const [
    legacyPage,
    resultsPage,
    service,
    assignmentService,
    view,
    navigation,
  ] = await Promise.all([
    readFile(
      new URL(
        "../../app/(protected)/teacher/courses/[courseId]/analytics/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(protected)/teacher/results/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../services/course-analytics/service.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../services/assignment-results/service.ts", import.meta.url),
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

  assert.match(legacyPage, /requirePageRole\(Role\.TEACHER\)/u);
  assert.match(legacyPage, /courseIdSchema\.safeParse/u);
  assert.match(legacyPage, /redirect\(\s*`\/teacher\/results\?courseId=/u);
  assert.match(resultsPage, /requirePageRole\(Role\.TEACHER\)/u);
  assert.match(resultsPage, /getTeacherCourseAnalytics\(/u);
  assert.match(
    resultsPage,
    /TeacherCourseAnalyticsView[\s\S]*data=\{analytics\}/u,
  );
  assert.match(resultsPage, /name="courseId"/u);
  assert.match(resultsPage, /name="classroomId"/u);
  assert.match(resultsPage, /params\.set\("courseId", query\.courseId\)/u);
  assert.match(
    resultsPage,
    /params\.set\("classroomId", query\.classroomId\)/u,
  );
  assert.match(resultsPage, /不同课程的知识点不会合并统计/u);
  assert.match(service, /where: \{ id: courseId, teacherId \}/u);
  assert.match(service, /classroomId \? \{ id: classroomId \} : \{\}/u);
  assert.match(service, /classroomId \? \{ classroomId \} : \{\}/u);
  assert.match(service, /AttendanceSessionStatus\.CLOSED/u);
  assert.match(service, /currentPublishedKnowledgeGraphVersion/u);
  assert.match(service, /currentTeachingProgressRevision/u);
  assert.match(assignmentService, /query\.courseId/u);
  assert.match(assignmentService, /query\.classroomId/u);
  assert.match(service, /nextActions/u);
  assert.match(view, /本阶段教学待办/u);
  assert.match(view, /掌握情况与需要关注的知识点/u);
  assert.match(view, /课程评价闭环/u);
  assert.match(view, /href=\{courseBase \+ "\/surveys"\}/u);
  assert.match(view, /href=\{courseBase \+ "\/quality-report"\}/u);
  assert.match(view, /问卷管理/u);
  assert.match(view, /教学质量报告/u);
  assert.match(navigation, /title: "课程分析中心"/u);
  assert.match(navigation, /path: "analytics"/u);
  assert.match(navigation, /title: "结课问卷"[\s\S]*?path: "surveys"/u);
  assert.match(
    navigation,
    /title: "教学质量分析"[\s\S]*?path: "quality-report"/u,
  );
  assert.match(
    navigation,
    /group\.title === "评价分析" && path === "analytics"/u,
  );
  assert.match(navigation, /`\/teacher\/results\?courseId=/u);
});
