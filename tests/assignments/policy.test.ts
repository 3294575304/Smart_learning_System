import assert from "node:assert/strict";
import test from "node:test";
import {
  AssignmentStatus,
  ClassroomStatus,
  MembershipStatus,
} from "@prisma/client";

import { ResourceNotFoundError } from "../../services/auth/policy";
import { AssignmentOperationError } from "../../services/assignments/errors";
import {
  assertActiveMembership,
  assertAssignmentAcceptsWork,
  assertCanStartAttempt,
  assertTeacherOwnsClassroom,
} from "../../services/assignments/policy";

test("teacher may only publish to an owned active classroom", () => {
  assert.doesNotThrow(() =>
    assertTeacherOwnsClassroom("teacher-1", {
      teacherId: "teacher-1",
      status: ClassroomStatus.ACTIVE,
    }),
  );
  assert.throws(
    () =>
      assertTeacherOwnsClassroom("teacher-1", {
        teacherId: "teacher-2",
        status: ClassroomStatus.ACTIVE,
      }),
    ResourceNotFoundError,
  );
});

test("inactive membership is hidden as a missing assignment", () => {
  assert.throws(
    () => assertActiveMembership({ status: MembershipStatus.LEFT }),
    ResourceNotFoundError,
  );
});

test("work is rejected before publish and at the deadline", () => {
  const now = new Date("2026-07-15T10:00:00.000Z");
  assert.throws(
    () =>
      assertAssignmentAcceptsWork(
        {
          status: AssignmentStatus.PUBLISHED,
          publishedAt: new Date("2026-07-15T11:00:00.000Z"),
          dueAt: new Date("2026-07-15T12:00:00.000Z"),
        },
        now,
      ),
    ResourceNotFoundError,
  );
  assert.throws(
    () =>
      assertAssignmentAcceptsWork(
        {
          status: AssignmentStatus.PUBLISHED,
          publishedAt: new Date("2026-07-15T09:00:00.000Z"),
          dueAt: now,
        },
        now,
      ),
    AssignmentOperationError,
  );
});

test("second attempt requires the assignment resubmission switch", () => {
  assert.throws(
    () => assertCanStartAttempt(false, 1),
    AssignmentOperationError,
  );
  assert.doesNotThrow(() => assertCanStartAttempt(true, 1));
});
