import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(
    syllabusParseFailureMessage("AI_OUTPUT_TRUNCATED"),
    /自动紧凑重试/u,
  );
  assert.match(
    syllabusParseFailureMessage("AI_OUTPUT_TRUNCATED"),
    /SYLLABUS_AI_MAX_COMPLETION_TOKENS/u,
  );
});

test("failed syllabus parsing exposes a visible interactive retry button", async () => {
  const component = await readFile(
    new URL(
      "../../components/courses/course-syllabus-review-panel.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(component, /aria-label="重新解析教学大纲"/u);
  assert.match(component, /onClick=\{\(\) => void parse\(\)\}/u);
  assert.match(component, /border-red-600/u);
  assert.match(component, /重新解析中/u);
});
