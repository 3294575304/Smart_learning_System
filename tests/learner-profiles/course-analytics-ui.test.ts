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
  assert.match(
    legacyPage,
    /redirect\("\/teacher\/results\?" \+ query\.toString\(\)\)/u,
  );
  assert.match(legacyPage, /query\.set\("classroomId", classroomId\)/u);
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
  assert.match(resultsPage, /选择一门课程查看该课程已发布作业的完成率/u);
  assert.match(service, /where: \{ id: courseId, teacherId \}/u);
  assert.match(
    service,
    /status: "ACTIVE"[\s\S]*?classroomId \? \{ id: classroomId \} : \{\}/u,
  );
  assert.match(service, /status: MembershipStatus\.ACTIVE/u);
  assert.match(service, /teacherId,[\s\S]*?classroom: \{[\s\S]*?courseId/u);
  assert.match(
    service,
    /AssignmentStatus\.PUBLISHED[\s\S]*?AssignmentStatus\.CLOSED/u,
  );
  assert.match(service, /SubmissionStatus\.SUBMITTED/u);
  assert.match(service, /SubmissionStatus\.PENDING_REVIEW/u);
  assert.match(service, /SubmissionStatus\.GRADED/u);
  assert.match(service, /SubmissionStatus\.PUBLISHED/u);
  assert.match(service, /calculateCourseAssignmentStatistics/u);
  assert.match(service, /assignmentStatistics,/u);
  assert.match(assignmentService, /query\.courseId/u);
  assert.match(assignmentService, /query\.classroomId/u);
  assert.match(resultsPage, /results\.items\.map/u);
  assert.match(
    resultsPage,
    /hrefForPage=\{\(page\) => pageHref\(query, page\)\}/u,
  );
  assert.match(resultsPage, /完成率、得分率与分数段/u);
  assert.match(view, /aria-labelledby="course-assignment-statistics-heading"/u);
  assert.match(view, /作业统计/u);
  assert.match(view, /作业完成率/u);
  assert.match(view, /作业得分率/u);
  assert.match(view, /学生分数段分布/u);
  assert.match(view, /未评分/u);
  assert.match(view, /本阶段教学待办/u);
  assert.match(view, /掌握情况与需要关注的知识点/u);
  assert.match(view, /href=\{courseBase \+ "\/surveys\//u);
  assert.match(
    view,
    /withClassroomQuery\([\s\S]*?courseBase \+ "\/quality-report"/u,
  );
  assert.match(view, /data\.recentSurveys\.slice\(0, 1\)/u);
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
