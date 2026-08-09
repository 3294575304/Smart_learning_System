import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeProgramOutput,
  programmingAttemptFingerprint,
} from "../../services/programming-attempts/fingerprint";

test("programming fingerprint is stable across object key ordering", () => {
  const left = programmingAttemptFingerprint({
    sourceCode: "print(1)",
    configHash: "abc",
    ruleVersion: "v1",
  });
  const right = programmingAttemptFingerprint({
    ruleVersion: "v1",
    configHash: "abc",
    sourceCode: "print(1)",
  });
  assert.equal(left, right);
  assert.equal(left.length, 64);
});

test("program output comparison normalizes line endings and trailing whitespace only", () => {
  assert.equal(normalizeProgramOutput("a\r\nb\r\n"), "a\nb");
  assert.notEqual(normalizeProgramOutput("a b"), normalizeProgramOutput("ab"));
});
