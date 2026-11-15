import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { NAVIGATION } from "../../components/dashboard/navigation";

test("学生课程学习中心按全课程知识点和评分记录统计", async () => {
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
  assert.doesNotMatch(
    service,
    /listStudentPracticeCourses|courseTeachingProgressRevision|taughtConceptIds/u,
  );
  assert.match(service, /prisma\.learningEvent\.findMany/u);
  assert.match(service, /supersededBy: null/u);
  assert.match(service, /courseCycle:[\s\S]*?classroomId/u);
  assert.match(service, /const evidenceConcepts = orderedPointViews\.filter/u);
  assert.match(service, /progressSteps:/u);
  assert.match(service, /trackableRecommendations/u);
  assert.match(service, /learningPriority/u);
  assert.match(service, /recentActivity: events/u);
  assert.match(page, /requirePageRole\(Role\.STUDENT\)/u);
  assert.match(page, /getStudentCourseLearningCenter/u);
  // 四级漏斗已从 view 组件抽到共享展示组件，断言目标随迁移同步
  const funnel = await readFile(
    new URL("../../components/ui/stat-funnel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(funnel, /md:grid-cols-3/u);
  assert.doesNotMatch(funnel, /四级口径|逐层收窄/u);
  assert.doesNotMatch(page, /课程已授范围|已授范围按当前教学班/u);
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
  // 我的课程列表已改用统一的班级分析服务聚合教学班，断言同步到当前实现
  assert.match(courses, /getStudentClassAnalytics/u);
  assert.match(courses, /key=\{classroom.id\}/u);
  assert.match(courses, /查看教学班/u);
  // 进入态文案在 aria-label 里按报名状态拼接（进入/查看 + 教学班：课程名）
  assert.match(courses, /教学班：\$\{course\.name\}/u);
  assert.match(courses, /我的学习分析/u);
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
