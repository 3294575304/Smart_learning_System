import assert from "node:assert/strict";
import test from "node:test";

import { assignmentResultsQuerySchema } from "../../services/assignment-results/schemas";

const studentId = "cm12345678901234567890123";

test("results query applies pagination defaults", () => {
  const result = assignmentResultsQuerySchema.parse({});
  assert.deepEqual(result, { page: 1, pageSize: 20 });
});

test("results query accepts a selected student and bounded page size", () => {
  const result = assignmentResultsQuerySchema.safeParse({
    page: "2",
    pageSize: "50",
    studentId,
  });
  assert.equal(result.success, true);
});

test("results query rejects invalid pagination and identifiers", () => {
  assert.equal(
    assignmentResultsQuerySchema.safeParse({ page: 0, pageSize: 51 }).success,
    false,
  );
  assert.equal(
    assignmentResultsQuerySchema.safeParse({ studentId: "other-student" })
      .success,
    false,
  );
  assert.equal(
    assignmentResultsQuerySchema.safeParse({ submissionId: studentId }).success,
    false,
  );
});
