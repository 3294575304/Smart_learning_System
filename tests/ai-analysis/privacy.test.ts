import assert from "node:assert/strict";
import test from "node:test";

import {
  createAnonymousStudentId,
  scrubSensitiveText,
} from "../../services/ai/privacy";

test("student pseudonyms are deterministic and do not expose the source id", () => {
  const first = createAnonymousStudentId(
    "student-real-id",
    "test-pseudonym-salt-123",
  );
  const second = createAnonymousStudentId(
    "student-real-id",
    "test-pseudonym-salt-123",
  );
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/u);
  assert.equal(first.includes("student-real-id"), false);
});

test("free text removes known identity values, email, phone and long ids", () => {
  const result = scrubSensitiveText(
    "张小明 email test@example.com phone 13800138000 学号 202600001234",
    ["张小明"],
  );
  assert.equal(result.includes("张小明"), false);
  assert.equal(result.includes("test@example.com"), false);
  assert.equal(result.includes("13800138000"), false);
  assert.equal(result.includes("202600001234"), false);
});
