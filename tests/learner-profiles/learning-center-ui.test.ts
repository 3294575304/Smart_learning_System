import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NAVIGATION } from "../../components/dashboard/navigation";

test("学生课程学习中心复用正式图谱、画像、进度与学习事件", async () => {
  const [service, page, view, analytics, courses] = await Promise.all([
    readFile(
      new URL(
        "../../services/learner-profiles/learning-center.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(protected)/student/courses/[courseId]/learning-center/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/learner-profiles/student-course-learning-center.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(protected)/student/analytics/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(protected)/student/courses/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(service, /getStudentPublishedKnowledgeGraph/u);
  assert.match(service, /getStudentLearnerProfile/u);
  assert.match(service, /listStudentPracticeCourses/u);
  assert.match(service, /prisma\.learningEvent\.findMany/u);
  assert.match(service, /supersededBy: null/u);
  assert.match(service, /courseCycle:[\s\S]*?classroomId/u);
  assert.match(service, /const taught = orderedPointViews\.filter/u);
  assert.match(service, /progressSteps:/u);
  assert.match(service, /trackableRecommendations/u);
  assert.match(service, /learningPriority/u);
  assert.match(service, /recentActivity: events/u);
  assert.match(page, /requirePageRole\(Role\.STUDENT\)/u);
  assert.match(page, /getStudentCourseLearningCenter/u);
  assert.match(view, /四级口径逐层收窄/u);
  const tabs = await readFile(
    new URL(
      "../../components/learner-profiles/course-workspace-tabs.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(tabs, /课程学习中心页面导航/u);
  assert.match(view, /按章节查看知识状态/u);
  assert.match(view, /我的学习路径/u);
  assert.match(view, /优先巩固/u);
  assert.match(view, /先补：/u);
  assert.match(view, /待进一步评估/u);
  assert.match(analytics, /课程学习中心/u);
  assert.match(analytics, /getStudentClassAnalytics/u);
  assert.match(analytics, /classroomId/u);
  assert.match(analytics, /教学班/u);
  const analysisView = await readFile(
    new URL(
      "../../components/dashboard/student-analysis-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(analysisView, /learning-center/u);
  assert.match(courses, /requirePageRole\(Role\.STUDENT\)/u);
  assert.match(courses, /listStudentCourseEvaluationContexts/u);
  assert.match(courses, /key=\{classroom.id\}/u);
  assert.match(courses, /进入教学班/u);
  assert.match(courses, /查看教学班/u);
  assert.match(courses, /学情分析/u);
  assert.doesNotMatch(
    courses,
    /成绩与评价|自主练习|href=\{`\/student\/assignments/u,
  );
  assert.match(
    courses,
    /classroomId=\$\{encodeURIComponent\(classroom.id\)\}/u,
  );
  assert.match(courses, /courseId: course.id/u);
  assert.match(courses, /classroomId: classroom.id/u);
  assert.ok(
    NAVIGATION.STUDENT.flatMap((group) => group.items).some(
      (item) => item.href === "/student/courses" && item.label === "我的课程",
    ),
  );
});
