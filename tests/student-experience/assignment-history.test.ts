import assert from "node:assert/strict";
import test from "node:test";
import { studentAssignmentState } from "@/services/student-experience/task-policy";
test("历史作业仅作记录，不把残留作答草稿计入待办", () => {
  const future = new Date("2030-01-01");
  const now = new Date("2026-10-07");
  assert.equal(
    studentAssignmentState(
      {
        dueAt: future,
        latestSubmissionId: "mine",
        inProgressSubmissionId: "draft",
        historyOnly: true,
      },
      now,
    ),
    "SUBMITTED",
  );
  assert.equal(
    studentAssignmentState(
      {
        dueAt: future,
        latestSubmissionId: null,
        inProgressSubmissionId: "draft",
        historyOnly: true,
      },
      now,
    ),
    "EXPIRED",
  );
});
