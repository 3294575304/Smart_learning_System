import "server-only";

export function isStudyAssistantPilotStudent(studentId: string) {
  return (process.env.STUDENT_STUDY_ASSISTANT_PILOT_IDS ?? "")
    .split(",")
    .some((id) => id.trim() === studentId);
}
