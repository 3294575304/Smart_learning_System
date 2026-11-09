import { isDeepStrictEqual } from "node:util";
import { QuestionOrigin } from "@prisma/client";

// Keep in sync with the historical backfill. Metadata such as tags and course
// objective mappings does not affect whether the generated content was adopted.
const contentFields = [
  "title",
  "content",
  "type",
  "options",
  "answer",
  "explanation",
] as const;

export function confirmedQuestionOrigin(candidate: {
  questionJson: unknown;
  programmingConfig: unknown;
  reviewHistory: unknown;
}): QuestionOrigin {
  const original = Array.isArray(candidate.reviewHistory)
    ? candidate.reviewHistory.map(record).find((entry) => entry?.revision === 1)
    : undefined;
  const currentQuestion = record(candidate.questionJson);
  const originalQuestion = record(original?.questionJson);
  const changed =
    original &&
    (!isDeepStrictEqual(
      original.programmingConfig ?? null,
      candidate.programmingConfig ?? null,
    ) ||
      contentFields.some(
        (key) =>
          !isDeepStrictEqual(originalQuestion?.[key], currentQuestion?.[key]),
      ));
  return changed ? QuestionOrigin.AI_ASSISTED : QuestionOrigin.AI_GENERATED;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
