import assert from "node:assert/strict";
import test from "node:test";

import { createAnalysisRequestKey } from "../../services/ai/request-key";
import { analysisInputFixture } from "./fixtures";

test("request keys are stable for the same batch and prompt version", () => {
  const first = createAnalysisRequestKey(analysisInputFixture, "v1");
  const second = createAnalysisRequestKey(
    structuredClone(analysisInputFixture),
    "v1",
  );
  assert.equal(first, second);
});

test("request keys change when source data or prompt version changes", () => {
  const baseline = createAnalysisRequestKey(analysisInputFixture, "v1");
  const changed = structuredClone(analysisInputFixture);
  changed.answers[0].isCorrect = true;
  assert.notEqual(createAnalysisRequestKey(changed, "v1"), baseline);
  assert.notEqual(
    createAnalysisRequestKey(analysisInputFixture, "v2"),
    baseline,
  );
});
