import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldPollSyllabusParse,
  syllabusParseFailureMessage,
} from "@/components/courses/syllabus-parse-presenter";

test("syllabus polling continues for pending work and stops at terminal state", () => {
  assert.equal(shouldPollSyllabusParse("PENDING"), true);
  assert.equal(shouldPollSyllabusParse("PROCESSING"), true);
  assert.equal(shouldPollSyllabusParse("SUCCEEDED"), false);
  assert.equal(shouldPollSyllabusParse("FAILED"), false);
});

test("syllabus failures show actionable reasons including explicit retry", () => {
  assert.match(syllabusParseFailureMessage("PROVIDER_TIMEOUT"), /未自动重试/u);
  assert.match(syllabusParseFailureMessage("JOB_INTERRUPTED"), /重新解析/u);
  assert.match(syllabusParseFailureMessage("INVALID_AI_OUTPUT"), /不符合/u);
});
