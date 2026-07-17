import type { StudentAnalysisInput } from "../../services/ai/schemas";

export const analysisInputFixture: StudentAnalysisInput = {
  anonymousStudentId: "a".repeat(64),
  answers: [
    {
      knowledgePointIds: ["kp-algebra"],
      difficulty: 3,
      studentAnswer: "x=4",
      standardAnswer: "x=3",
      isCorrect: false,
      responseTimeMs: 45_000,
    },
    {
      knowledgePointIds: ["kp-geometry"],
      difficulty: 2,
      studentAnswer: "90°",
      standardAnswer: "90°",
      isCorrect: true,
      responseTimeMs: 20_000,
    },
  ],
  historicalKnowledgePointAccuracy: [
    {
      knowledgePointId: "kp-algebra",
      correctCount: 2,
      answeredCount: 5,
      accuracy: 0.4,
    },
  ],
  recentErrors: [
    {
      knowledgePointIds: ["kp-algebra"],
      difficulty: 3,
      occurredAt: "2026-07-17T01:00:00.000Z",
    },
  ],
  tutoringSummaries: ["学生询问了移项时符号变化的原因。"],
};
