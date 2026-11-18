import type { AutosaveAnswersData } from "@/services/assignments/schemas";

export const examAutoSubmitEndpoint = "/api/student/exams/auto-submit";

export function examExitBody(
  submissionId: string,
  answers?: AutosaveAnswersData,
) {
  const snapshot = JSON.stringify({ submissionId, trigger: "EXIT", answers });
  // Browsers cap pending keepalive payload bytes per document. The server can
  // still collect the already-synced draft if the latest snapshot is too large.
  return new TextEncoder().encode(snapshot).byteLength <= 60_000
    ? snapshot
    : JSON.stringify({ submissionId, trigger: "EXIT" });
}
