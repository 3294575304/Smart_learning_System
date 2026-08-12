import assert from "node:assert/strict";
import test from "node:test";

import {
  assessmentLearningEventPayloadSchema,
  recommendationPracticeLearningEventPayloadSchema,
} from "../../services/learning-events/schemas";

const validPayload = {
  studentAnswerId: "cm0x8zbrc0000qzrmn831i7rn",
  evidenceStatus: "VALID",
  gradingSource: "AUTO_GRADING",
  score: "8.0000",
  maxScore: "10.0000",
  gradedAt: "2026-08-08T00:00:00.000Z",
  conceptSnapshotCount: 2,
};

test("assessment events accept only the versioned de-identified payload", () => {
  assert.equal(
    assessmentLearningEventPayloadSchema.safeParse(validPayload).success,
    true,
  );
  assert.equal(
    assessmentLearningEventPayloadSchema.safeParse({
      ...validPayload,
      studentName: "不应写入事件",
    }).success,
    false,
  );
  assert.equal(
    assessmentLearningEventPayloadSchema.safeParse({
      ...validPayload,
      score: "not-a-score",
    }).success,
    false,
  );
});

test("recommendation practice events keep only deterministic de-identified data", () => {
  const payload = {
    recommendationId: "cm0x8zbrc0000qzrmn831i7rn",
    recommendationPracticeAnswerId: "cm0x8zbrc0001qzrmn831i7ro",
    score: "1.0000",
    maxScore: "1.0000",
    isCorrect: true,
    conceptSnapshotCount: 1,
  };
  assert.equal(
    recommendationPracticeLearningEventPayloadSchema.safeParse(payload).success,
    true,
  );
  assert.equal(
    recommendationPracticeLearningEventPayloadSchema.safeParse({
      ...payload,
      studentName: "not-allowed",
    }).success,
    false,
  );
});
