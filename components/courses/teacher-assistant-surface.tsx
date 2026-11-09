import { Suspense } from "react";
import { teacherEvaluationAssistantEnabled } from "@/services/course-analytics/evaluation-assistant";
import { listTeacherAssistantCourses } from "@/services/course-analytics/evaluation-state";
import { TeacherAssistantLauncher } from "./teacher-assistant-launcher";

export async function TeacherAssistantSurface({
  teacherId,
}: {
  teacherId: string;
}) {
  if (!teacherEvaluationAssistantEnabled()) return null;
  const courses = await listTeacherAssistantCourses(teacherId);
  return (
    <Suspense>
      <TeacherAssistantLauncher courses={courses} />
    </Suspense>
  );
}
