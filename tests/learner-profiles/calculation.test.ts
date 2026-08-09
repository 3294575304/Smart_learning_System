import assert from "node:assert/strict";
import test from "node:test";

import {
  evidenceConfidence,
  learnerProfileEvidenceState,
} from "../../services/learner-profiles/calculation";
import { learnerProfileFingerprint } from "../../services/learner-profiles/fingerprint";

test("profile evidence states do not overstate sparse evidence", () => {
  assert.equal(learnerProfileEvidenceState(0), "NO_EVIDENCE");
  assert.equal(learnerProfileEvidenceState(1), "INSUFFICIENT_EVIDENCE");
  assert.equal(learnerProfileEvidenceState(2), "INSUFFICIENT_EVIDENCE");
  assert.equal(learnerProfileEvidenceState(3), "CONCLUSIVE");
  assert.deepEqual([0, 1, 2, 3].map(evidenceConfidence), [0, 0.34, 0.67, 0.7]);
  assert.equal(evidenceConfidence(100), 1);
});

test("same inputs and rule version reuse the same profile fingerprint", () => {
  assert.equal(
    learnerProfileFingerprint({ ruleVersion: "v1", eventIds: ["a", "b"] }),
    learnerProfileFingerprint({ eventIds: ["a", "b"], ruleVersion: "v1" }),
  );
  assert.notEqual(
    learnerProfileFingerprint({ ruleVersion: "v1", eventIds: ["a"] }),
    learnerProfileFingerprint({ ruleVersion: "v2", eventIds: ["a"] }),
  );
});
