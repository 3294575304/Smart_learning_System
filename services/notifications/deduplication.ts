function key(kind: string, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export const notificationDeduplication = {
  assignmentPublished: (assignmentId: string) =>
    key("assignment-published", assignmentId),
  assignmentDueSoon: (assignmentId: string, deadline?: string) =>
    key(
      "assignment-due-24h",
      deadline ? `${assignmentId}:${deadline}` : assignmentId,
    ),
  assignmentGraded: (submissionId: string) =>
    key("assignment-graded", submissionId),
  learningAnalysisReady: (analysisId: string) =>
    key("learning-analysis-ready", analysisId),
  recommendationReady: (cycleKey: string) =>
    key("recommendation-ready", cycleKey),
  systemAnnouncement: (announcementId: string) =>
    key("system-announcement", announcementId),
  classroomDissolved: (classroomId: string) =>
    key("classroom-dissolved", classroomId),
} as const;
