import assert from "node:assert/strict";
import test from "node:test";

import {
  assignmentResultsQuerySchema,
  teacherResultsOverviewQuerySchema,
} from "../../services/assignment-results/schemas";

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

test("teacher results overview query validates classroom pagination", () => {
  assert.deepEqual(teacherResultsOverviewQuerySchema.parse({}), {
    page: 1,
    pageSize: 10,
  });
  assert.equal(
    teacherResultsOverviewQuerySchema.safeParse({
      classroomId: studentId,
      pageSize: 30,
    }).success,
    true,
  );
  assert.equal(
    teacherResultsOverviewQuerySchema.safeParse({ pageSize: 31 }).success,
    false,
  );
});
