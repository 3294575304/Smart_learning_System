import assert from "node:assert/strict";
import test from "node:test";

import { questionMappingAIOutputSchema } from "../../services/question-mapping/schemas";

const questionId = "cm0000000000000000000001";
const conceptId = "cm0000000000000000000002";

test("AI mapping output accepts a strict bounded candidate contract", () => {
  const result = questionMappingAIOutputSchema.parse({
    mappings: [
      {
        questionId,
        candidates: [
          {
            conceptId,
            confidence: 0.92,
            reason: "题干直接考查循环结构",
          },
        ],
      },
    ],
  });

  assert.equal(result.mappings[0]?.candidates[0]?.conceptId, conceptId);
});

test("AI mapping output rejects extra fields and duplicate candidates", () => {
  assert.equal(
    questionMappingAIOutputSchema.safeParse({
      mappings: [
        {
          questionId,
          leakedAnswer: "answer",
          candidates: [],
        },
      ],
    }).success,
    false,
  );

  assert.equal(
    questionMappingAIOutputSchema.safeParse({
      mappings: [
        {
          questionId,
          candidates: [
            { conceptId, confidence: 0.8, reason: "候选一" },
            { conceptId, confidence: 0.7, reason: "重复候选" },
          ],
        },
      ],
    }).success,
    false,
  );
});
