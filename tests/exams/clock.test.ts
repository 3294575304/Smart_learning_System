import assert from "node:assert/strict";
import test from "node:test";
import { formatExamRemaining } from "@/components/exams/exam-clock";

test("formats the exam clock across hour and minute boundaries", () => {
  assert.equal(formatExamRemaining(7200), "2:00:00");
  assert.equal(formatExamRemaining(3600), "1:00:00");
  assert.equal(formatExamRemaining(3599), "59:59");
  assert.equal(formatExamRemaining(59), "00:59");
  assert.equal(formatExamRemaining(0), "00:00");
});
