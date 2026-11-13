import "server-only";

import { notFound, redirect } from "next/navigation";
import { getTeacherExamIdForAssignment } from "./service";
import { examClassroomHref } from "./classroom-navigation";

export async function resolveTeacherAssessmentPage(
  teacherId: string,
  assignmentId: string,
  requestedExamId: string | undefined,
  suffix = "",
  query: Record<string, string | string[] | undefined> = {},
) {
  const examId = await getTeacherExamIdForAssignment(teacherId, assignmentId);
  if (requestedExamId !== undefined && requestedExamId !== examId) notFound();
  if (examId && requestedExamId === undefined) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "source" || key === "examId" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value])
        params.append(key, item);
    }
    redirect(
      `${examClassroomHref(examId, assignmentId)}${suffix}${params.size ? `?${params}` : ""}`,
    );
  }
  return examId;
}
