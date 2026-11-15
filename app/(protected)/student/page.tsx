import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { StudentHomeInsights } from "@/components/dashboard/student-home-insights";
import { StudentHomeView } from "@/components/dashboard/student-home-view";
import type { HomeKnowledgeChapter } from "@/components/dashboard/home-knowledge-matrix";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentClassAnalytics } from "@/services/dashboard/student-class-analytics";
import { getStudentHomeKnowledge } from "@/services/dashboard/student-home-knowledge";
import { getStudentHomePulse } from "@/services/dashboard/student-home-pulse";
import { getStudentSidebarMetaShared } from "@/services/dashboard/student-sidebar";
import {
  getStudentTaskOverviewShared,
  sharedNowMs,
} from "@/services/dashboard/student-task-service";
import { selectStudentEnrollment } from "@/services/courses/student-enrollment";

export default async function StudentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  // 与外壳同一次统计：徽标、侧栏周次、正文指标都从这一次查询里来。
  const nowMs = sharedNowMs();
  const now = new Date(nowMs);
  const [overview, analytics, pulse, sidebarMeta] = await Promise.all([
    getStudentTaskOverviewShared(student.id, nowMs),
    getStudentClassAnalytics(student.id, {}, now),
    getStudentHomePulse(student.id, now),
    getStudentSidebarMetaShared(student.id, nowMs),
  ]);
  let selected;
  try {
    selected = selectStudentEnrollment(analytics.classes, {
      ...(raw.courseId !== undefined ? { courseId: raw.courseId } : {}),
      ...(raw.classroomId !== undefined
        ? { classroomId: raw.classroomId }
        : {}),
    });
  } catch {
    notFound();
  }

  // 知识掌握既要喂右侧卡片，也要喂"知识掌握"这个指标，
  // 所以从 Suspense 里提到页面：一次查询，两处读数不会对不上。
  let chapters: HomeKnowledgeChapter[] = [];
  let knowledgeError = false;
  if (selected) {
    try {
      const knowledge = await getStudentHomeKnowledge(
        student.id,
        selected.course.id,
        selected.classroom.id,
      );
      chapters = knowledge.heatmap;
    } catch (error) {
      knowledgeError = true;
      if (!(error instanceof ResourceNotFoundError)) {
        console.error("student_home_knowledge_failed", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
  }

  return (
    <>
      <SurveyAvailabilityRefresh at={overview.nextChangeAt?.toISOString()} />
      <StudentHomeView
        insights={
          <StudentHomeInsights
            chapters={chapters}
            classes={analytics.classes}
            knowledgeError={knowledgeError}
            now={now}
            overview={overview}
            pulse={pulse}
            selected={selected}
          />
        }
        name={student.displayName ?? "同学"}
        now={now}
        overview={overview}
        pulse={pulse}
        week={sidebarMeta.week}
      />
    </>
  );
}
