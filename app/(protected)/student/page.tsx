import { getStudentExamClassAverage } from "@/services/exams/student-score-context";
import { Role } from "@prisma/client";
import { Suspense } from "react";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { StudentHomeView } from "@/components/dashboard/student-home-view";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import { StudentHomeInsights } from "@/components/dashboard/student-home-insights";
import { getStudentClassAnalytics } from "@/services/dashboard/student-class-analytics";
import {
  StudentHomeKnowledge,
  StudentHomeKnowledgeLoading,
} from "@/components/dashboard/student-home-knowledge";
import { selectStudentEnrollment } from "@/services/courses/student-enrollment";
import { notFound } from "next/navigation";

export default async function StudentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const now = new Date();
  const [overview, analytics] = await Promise.all([
    getStudentTaskOverview(student.id, now),
    getStudentClassAnalytics(student.id, {}, now),
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
  const recentExam = analytics.exams.recent;
  const classAverage =
    recentExam?.resultState === "PUBLISHED"
      ? await getStudentExamClassAverage(
          student.id,
          recentExam.assignmentId,
          recentExam.classroomId,
          now,
        )
      : null;
  return (
    <>
      <SurveyAvailabilityRefresh at={overview.nextChangeAt?.toISOString()} />
      <StudentHomeView
        name={student.displayName ?? "同学"}
        overview={overview}
        insights={
          <StudentHomeInsights
            classes={analytics.classes}
            exams={analytics.exams}
            examClassAverage={classAverage}
            selected={selected}
            knowledge={
              selected ? (
                <Suspense
                  key={selected.classroom.id}
                  fallback={<StudentHomeKnowledgeLoading />}
                >
                  <StudentHomeKnowledge
                    studentId={student.id}
                    courseId={selected.course.id}
                    classroomId={selected.classroom.id}
                  />
                </Suspense>
              ) : undefined
            }
            overview={overview}
            now={now}
          />
        }
      />
    </>
  );
}
