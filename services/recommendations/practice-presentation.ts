import { QuestionType, RecommendationStatus } from "@prisma/client";

import type { RecommendationViewRecord } from "@/services/recommendations/repository";
import type { RecommendationPracticeResultView } from "@/services/recommendations/types";

function formatOptions(
  options: Array<{ label: string; content: string }>,
): string {
  if (options.length === 0) return "未作答";
  return options
    .map((option) => `${option.label}. ${option.content}`)
    .join("；");
}

function studentAnswer(record: RecommendationViewRecord): string {
  const answer = record.practiceAnswer;
  if (!answer) return "未作答";
  if (
    record.question.type === QuestionType.SINGLE_CHOICE ||
    record.question.type === QuestionType.MULTIPLE_CHOICE
  ) {
    const selected = new Set(answer.selectedOptionIds);
    return formatOptions(
      record.question.options.filter((option) => selected.has(option.id)),
    );
  }
  if (record.question.type === QuestionType.TRUE_FALSE) {
    if (answer.booleanAnswer === null) return "未作答";
    return answer.booleanAnswer ? "正确" : "错误";
  }
  return answer.textAnswer?.trim() || "未作答";
}

function correctAnswer(record: RecommendationViewRecord): string {
  if (
    record.question.type === QuestionType.SINGLE_CHOICE ||
    record.question.type === QuestionType.MULTIPLE_CHOICE
  ) {
    return formatOptions(
      record.question.options.filter((option) => option.isCorrect),
    );
  }
  if (record.question.type === QuestionType.TRUE_FALSE) {
    if (record.question.correctBoolean === null) return "未设置";
    return record.question.correctBoolean ? "正确" : "错误";
  }
  if (record.question.type === QuestionType.FILL_BLANK) {
    return record.question.acceptableAnswers.length > 0
      ? record.question.acceptableAnswers.join("；")
      : "未设置";
  }
  return record.question.referenceAnswer?.trim() || "未设置参考答案";
}

export function practiceResultFromRecord(
  record: RecommendationViewRecord,
): RecommendationPracticeResultView | null {
  const answer = record.practiceAnswer;
  if (
    record.status !== RecommendationStatus.COMPLETED ||
    !record.completedAt ||
    !answer
  ) {
    return null;
  }
  const score = answer.score.toNumber();
  const maxScore = answer.maxScore.toNumber();
  return {
    recommendationId: record.id,
    status: record.status,
    completedAt: record.completedAt.toISOString(),
    totalCount: 1,
    correctCount: answer.isCorrect ? 1 : 0,
    score,
    maxScore,
    percentage:
      maxScore > 0 ? Math.round((score / maxScore) * 10_000) / 100 : 0,
    answers: [
      {
        questionId: record.question.id,
        title: record.question.title,
        studentAnswer: studentAnswer(record),
        correctAnswer: correctAnswer(record),
        explanation: record.question.explanation,
        recommendationReason: record.reason,
        isCorrect: answer.isCorrect,
        score,
        maxScore,
        responseTimeMs: answer.responseTimeMs,
      },
    ],
  };
}
