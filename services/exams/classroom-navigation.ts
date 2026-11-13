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
