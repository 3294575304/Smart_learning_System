import assert from "node:assert/strict";
import test from "node:test";

import { assessmentLearningEventPayloadSchema } from "../../services/learning-events/schemas";

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
