import assert from "node:assert/strict";
import test from "node:test";

import { conceptMasteryFingerprint } from "../../services/concept-mastery/fingerprint";

test("mastery fingerprints are stable across object key order", () => {
  const left = conceptMasteryFingerprint({
    ruleVersion: "concept-mastery-v1",
    evidence: [{ conceptId: "c1", score: "5.0000" }],
  });
  const right = conceptMasteryFingerprint({
    evidence: [{ score: "5.0000", conceptId: "c1" }],
    ruleVersion: "concept-mastery-v1",
  });
  assert.equal(left, right);
  assert.match(left, /^[a-f0-9]{64}$/);
});

test("mastery fingerprints change with evidence revision inputs", () => {
  const first = conceptMasteryFingerprint({
    conceptId: "c1",
    answerId: "a1",
    revision: 1,
    score: "3.0000",
  });
  const second = conceptMasteryFingerprint({
    conceptId: "c1",
    answerId: "a1",
    revision: 2,
    score: "4.0000",
  });
  assert.notEqual(first, second);
});
