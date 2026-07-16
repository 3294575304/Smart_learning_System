import assert from "node:assert/strict";
import test from "node:test";

import { assertTeacherOwnsAssignment } from "../../services/assignment-results/policy";
import { ResourceNotFoundError } from "../../services/auth/policy";

test("teacher may view results for an owned assignment", () => {
  assert.doesNotThrow(() =>
    assertTeacherOwnsAssignment("teacher-1", { teacherId: "teacher-1" }),
  );
});

test("another teacher assignment is hidden as missing", () => {
  assert.throws(
    () => assertTeacherOwnsAssignment("teacher-1", { teacherId: "teacher-2" }),
    ResourceNotFoundError,
  );
  assert.throws(
    () => assertTeacherOwnsAssignment("teacher-1", null),
    ResourceNotFoundError,
  );
});
