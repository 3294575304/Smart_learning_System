import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("学情分析保留课程权限、班级筛选和最近作业入口", async () => {
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
  assert.match(resultsPage, /courseId: firstValue\(rawQuery\.courseId\)/u);
  assert.match(
    resultsPage,
    /classroomId: firstValue\(rawQuery\.classroomId\)/u,
  );
  assert.match(
    resultsPage,
    /if \(parsedQuery\.courseId && !selectedCourse\) notFound\(\)/u,
  );
  assert.match(
    resultsPage,
    /if \(parsedQuery\.classroomId && !selectedClassroom\) notFound\(\)/u,
  );
  assert.match(resultsPage, /classroom\.course\?\.id === selectedCourse\.id/u);
  assert.match(resultsPage, /classroom\.status === "ACTIVE"/u);
  assert.match(resultsPage, /选择课程和班级查看学习证据、作业表现与近期作业/u);
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
  assert.match(resultsPage, /page: 1,[\s\S]*?pageSize: 5/u);
  assert.match(
    resultsPage,
    /selectedCourse\s*\? listTeacherResultsOverview\(teacher\.id, query\)/u,
  );
  assert.match(
    resultsPage,
    /recentAssignments=\{recentResults\?\.items \?\? \[\]\}/u,
  );
  assert.match(resultsPage, /title="学情分析"/u);
  assert.match(view, /assignmentParams\.set\("classroomId", classroomId\)/u);
  assert.match(
    view,
    /new URLSearchParams\(\{ courseId: data\.course\.id \}\)/u,
  );
  assert.match(
    view,
    /allAssignmentsHref=\{`\/teacher\/assignments\?\$\{assignmentParams\.toString\(\)\}`\}/u,
  );
  assert.match(
    view,
    /href=\{`\/teacher\/assignments\/\$\{assignment\.id\}\/results`\}/u,
  );
  assert.match(view, /暂无已发布作业/u);
  assert.match(view, /暂无已发布或已结束作业/u);
  assert.match(view, /当前筛选范围没有有效学生/u);
  assert.match(view, /暂无作业最终评分/u);
  assert.match(view, /aria-labelledby="course-assignment-statistics-heading"/u);
  assert.match(view, /作业统计/u);
  assert.match(view, /作业完成率/u);
  assert.match(view, /作业得分率/u);
  assert.match(view, /学生分数段分布/u);
  assert.match(view, /未评分/u);
  assert.match(view, /本阶段教学待办/u);
  assert.match(view, /章节掌握度/u);
  assert.match(
    view,
    /withClassroomQuery\(courseBase \+ "\/surveys", classroomId\)/u,
  );
  assert.match(
    view,
    /withClassroomQuery\([\s\S]*?courseBase \+ "\/quality-report"/u,
  );
  assert.match(view, /data\.overview\.completedSurveyCount/u);
  assert.match(view, /data\.overview\.surveyResponseCount/u);
  assert.match(view, /课程质量报告/u);
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
