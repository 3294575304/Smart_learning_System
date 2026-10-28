import { Role } from "@prisma/client";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { StudentHomeView } from "@/components/dashboard/student-home-view";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import { StudentHomeInsights } from "@/components/dashboard/student-home-insights";
import { getStudentClassAnalytics } from "@/services/dashboard/student-class-analytics";
import { getStudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";
import { selectStudentEnrollment } from "@/services/courses/student-enrollment";
import { ResourceNotFoundError } from "@/services/auth/policy";
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
  let knowledge;
  if (selected) {
    try {
      knowledge = await getStudentCourseLearningCenter(
        student.id,
        selected.course.id,
        selected.classroom.id,
      );
    } catch (error) {
      if (error instanceof ResourceNotFoundError) notFound();
      throw error;
    }
  }
  return (
    <>
      <SurveyAvailabilityRefresh at={overview.nextChangeAt?.toISOString()} />
      <StudentHomeView
        name={student.displayName ?? "同学"}
        overview={overview}
        insights={
          <StudentHomeInsights
            classes={analytics.classes}
            selected={selected}
            knowledge={knowledge}
            overview={overview}
          />
        }
      />
    </>
  );
}
