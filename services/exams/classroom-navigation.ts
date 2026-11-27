export function examClassroomHref(examId: string, assignmentId: string) {
  return `/teacher/exams/${examId}/classes/${assignmentId}`;
}

export function teacherAssessmentHref(
  assignmentId: string,
  examId?: string | null,
) {
  return examId
    ? examClassroomHref(examId, assignmentId)
    : `/teacher/assignments/${assignmentId}`;
}
import { teacherExamListSchema } from "./schemas";

export function examListContext(value: unknown): string {
  if (typeof value === "string" && value.length > 1200) return "";
  const parsed = teacherExamListSchema.safeParse(
    typeof value === "string"
      ? Object.fromEntries(new URLSearchParams(value))
      : value,
  );
  if (!parsed.success) return "";
  const query = new URLSearchParams();
  for (const [key, entry] of Object.entries(parsed.data))
    if (entry) query.set(key, entry);
  return query.toString();
}

export function examWorkspaceHref(href: string, listContext?: string): string {
  if (!listContext) return href;
  const [path, hash] = href.split("#");
  const params = new URLSearchParams({ examList: listContext });
  return `${path}${path.includes("?") ? "&" : "?"}${params}${hash ? `#${hash}` : ""}`;
}

export function examMonitorHref(examId: string, classroomId: string) {
  return `/teacher/exams/${examId}/monitor?classroomId=${classroomId}`;
}
