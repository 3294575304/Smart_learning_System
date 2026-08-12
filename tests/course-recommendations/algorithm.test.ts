import assert from "node:assert/strict";
import test from "node:test";

import {
  LearnerProfileEvidenceState,
  QuestionGraphBindingType,
} from "@prisma/client";

import { rankCourseRecommendationCandidates } from "../../services/course-recommendations/algorithm";

const policy = {
  weaknessWeight: 35,
  difficultyWeight: 15,
  freshnessWeight: 10,
  difficultyTolerance: 1,
};

test("course ranking prioritizes conclusive weak concepts deterministically", () => {
  const result = rankCourseRecommendationCandidates({
    candidates: [
      {
        question: { id: "strong", difficulty: 3 },
        bindings: [
          {
            conceptId: "concept-strong",
            conceptName: "函数",
            bindingType: QuestionGraphBindingType.PRIMARY,
          },
        ],
      },
      {
        question: { id: "weak", difficulty: 3 },
        bindings: [
          {
            conceptId: "concept-weak",
            conceptName: "循环",
            bindingType: QuestionGraphBindingType.PRIMARY,
          },
        ],
      },
    ],
    profiles: [
      {
        conceptId: "concept-strong",
        evidenceState: LearnerProfileEvidenceState.CONCLUSIVE,
        masteryScore: 90,
      },
      {
        conceptId: "concept-weak",
        evidenceState: LearnerProfileEvidenceState.CONCLUSIVE,
        masteryScore: 30,
      },
    ],
    requestedDifficulty: 3,
    policy,
    limit: 2,
  });
  assert.deepEqual(
    result.map((item) => item.question.id),
    ["weak", "strong"],
  );
  assert.match(result[0].reason, /掌握度 30%/u);
});

test("insufficient evidence creates a diagnostic reason instead of a weak label", () => {
  const [result] = rankCourseRecommendationCandidates({
    candidates: [
      {
        question: { id: "diagnostic", difficulty: 2 },
        bindings: [
          {
            conceptId: "concept-new",
            conceptName: "列表",
            bindingType: QuestionGraphBindingType.SECONDARY,
          },
        ],
      },
    ],
    profiles: [],
    requestedDifficulty: 2,
    policy,
    limit: 1,
  });
  assert.ok(result.reasonCodes.includes("DIAGNOSTIC_EVIDENCE"));
  assert.match(result.reason, /证据不足/u);
  assert.doesNotMatch(result.reason, /未掌握/u);
});
