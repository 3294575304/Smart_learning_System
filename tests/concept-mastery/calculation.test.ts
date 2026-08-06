import assert from "node:assert/strict";
import test from "node:test";
import { CourseConceptMasteryLevel, Prisma } from "@prisma/client";

import {
  calculateConceptMastery,
  courseConceptMasteryLevel,
  type EffectiveConceptEvidence,
} from "../../services/concept-mastery/calculation";

function evidence(
  id: string,
  studentAnswerId: string,
  conceptId: string,
  score: string,
  maxScore: string,
  gradedAt: string,
): EffectiveConceptEvidence {
  return {
    id,
    studentAnswerId,
    conceptId,
    score: new Prisma.Decimal(score),
    maxScore: new Prisma.Decimal(maxScore),
    gradedAt: new Date(gradedAt),
  };
}

test("concept mastery aggregates real points and preserves evidence counts", () => {
  const result = calculateConceptMastery([
    evidence("e1", "a1", "concept-a", "3", "4", "2026-08-01T00:00:00Z"),
    evidence("e2", "a2", "concept-a", "1", "6", "2026-08-03T00:00:00Z"),
    evidence("e3", "a3", "concept-b", "5", "5", "2026-08-02T00:00:00Z"),
  ]);

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((item) => ({
      conceptId: item.conceptId,
      evidenceCount: item.evidenceCount,
      distinctAnswerCount: item.distinctAnswerCount,
      earnedPoints: item.earnedPoints.toFixed(4),
      availablePoints: item.availablePoints.toFixed(4),
      masteryScore: item.masteryScore.toFixed(2),
      level: item.level,
    })),
    [
      {
        conceptId: "concept-a",
        evidenceCount: 2,
        distinctAnswerCount: 2,
        earnedPoints: "4.0000",
        availablePoints: "10.0000",
        masteryScore: "40.00",
        level: CourseConceptMasteryLevel.NEEDS_SUPPORT,
      },
      {
        conceptId: "concept-b",
        evidenceCount: 1,
        distinctAnswerCount: 1,
        earnedPoints: "5.0000",
        availablePoints: "5.0000",
        masteryScore: "100.00",
        level: CourseConceptMasteryLevel.MASTERED,
      },
    ],
  );
  assert.equal(
    result[0]?.firstEvidenceAt.toISOString(),
    "2026-08-01T00:00:00.000Z",
  );
  assert.equal(
    result[0]?.lastEvidenceAt.toISOString(),
    "2026-08-03T00:00:00.000Z",
  );
});

test("concept mastery uses fixed precision and safe partial-credit boundaries", () => {
  const result = calculateConceptMastery([
    evidence("e1", "a1", "c", "1", "3", "2026-08-01T00:00:00Z"),
  ]);
  assert.equal(result[0]?.masteryScore.toFixed(2), "33.33");
  assert.equal(result[0]?.level, CourseConceptMasteryLevel.NEEDS_SUPPORT);
  assert.equal(
    courseConceptMasteryLevel(new Prisma.Decimal("49.9999")),
    CourseConceptMasteryLevel.NEEDS_SUPPORT,
  );
  assert.equal(
    courseConceptMasteryLevel(new Prisma.Decimal("50")),
    CourseConceptMasteryLevel.DEVELOPING,
  );
  assert.equal(
    courseConceptMasteryLevel(new Prisma.Decimal("79.99")),
    CourseConceptMasteryLevel.DEVELOPING,
  );
  assert.equal(
    courseConceptMasteryLevel(new Prisma.Decimal("80")),
    CourseConceptMasteryLevel.MASTERED,
  );
});

test("invalid or zero-maximum evidence never creates a mastery entry", () => {
  const result = calculateConceptMastery([
    evidence("zero", "a1", "c", "0", "0", "2026-08-01T00:00:00Z"),
    evidence("negative", "a2", "c", "-1", "5", "2026-08-01T00:00:00Z"),
    evidence("overflow", "a3", "c", "6", "5", "2026-08-01T00:00:00Z"),
  ]);
  assert.deepEqual(result, []);
});

test("distinct answer count does not double-count multiple evidence rows", () => {
  const result = calculateConceptMastery([
    evidence("e1", "a1", "c", "2", "4", "2026-08-01T00:00:00Z"),
    evidence("e2", "a1", "c", "2", "4", "2026-08-01T00:00:00Z"),
  ]);
  assert.equal(result[0]?.evidenceCount, 2);
  assert.equal(result[0]?.distinctAnswerCount, 1);
});
