import assert from "node:assert/strict";
import test from "node:test";

import { parseQuestionObjectiveSuggestion } from "@/services/question-objectives/schemas";

test("AI 目标建议只能使用当前课程正式大纲给出的代码", () => {
  const output = { objectiveCode: "O2", confidence: 0.8, reason: "能力应用" };
  assert.deepEqual(
    parseQuestionObjectiveSuggestion(output, ["O1", "O2"]),
    output,
  );
  assert.throws(
    () => parseQuestionObjectiveSuggestion(output, ["O1"]),
    /OUT_OF_SCOPE/u,
  );
  assert.throws(() =>
    parseQuestionObjectiveSuggestion({ ...output, confidence: 2 }, ["O2"]),
  );
});
