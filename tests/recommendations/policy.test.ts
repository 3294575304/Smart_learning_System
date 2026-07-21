import assert from "node:assert/strict";
import test from "node:test";

import { ClassroomStatus, MembershipStatus, Role } from "@prisma/client";

import {
  AuthorizationError,
  ResourceNotFoundError,
} from "../../services/auth/policy";
import { RecommendationOperationError } from "../../services/recommendations/errors";
import {
  assertCanAccessRecommendation,
  assertCanRecommendForStudent,
} from "../../services/recommendations/policy";

const activeClassroom = {
  teacherId: "teacher-1",
  status: ClassroomStatus.ACTIVE,
  membershipStatus: MembershipStatus.ACTIVE,
};

function actor(id: string, role: Role) {
  return { id, role, email: `${id}@example.com`, displayName: id };
}

test("student can request only their own recommendation", () => {
  assert.doesNotThrow(() =>
    assertCanRecommendForStudent(
      actor("student-1", Role.STUDENT),
      "student-1",
      activeClassroom,
    ),
  );
  assert.throws(
    () =>
      assertCanRecommendForStudent(
        actor("student-2", Role.STUDENT),
        "student-1",
        activeClassroom,
      ),
    ResourceNotFoundError,
  );
});

test("teacher can request recommendations only for students in an owned classroom", () => {
  assert.doesNotThrow(() =>
    assertCanRecommendForStudent(
      actor("teacher-1", Role.TEACHER),
      "student-1",
      activeClassroom,
    ),
  );
  assert.throws(
    () =>
      assertCanRecommendForStudent(
        actor("teacher-2", Role.TEACHER),
        "student-1",
        activeClassroom,
      ),
    ResourceNotFoundError,
  );
  assert.throws(
    () =>
      assertCanRecommendForStudent(
        actor("teacher-1", Role.TEACHER),
        "student-1",
        { ...activeClassroom, membershipStatus: MembershipStatus.LEFT },
      ),
    ResourceNotFoundError,
  );
});

test("admin and inactive classrooms cannot use the recommendation workflow", () => {
  assert.throws(
    () =>
      assertCanRecommendForStudent(
        actor("admin-1", Role.ADMIN),
        "student-1",
        activeClassroom,
      ),
    AuthorizationError,
  );
  assert.throws(
    () =>
      assertCanRecommendForStudent(
        actor("teacher-1", Role.TEACHER),
        "student-1",
        { ...activeClassroom, status: ClassroomStatus.CLOSED },
      ),
    RecommendationOperationError,
  );
});

test("recommendation records are accessible only to the owning student", () => {
  assert.doesNotThrow(() =>
    assertCanAccessRecommendation(
      actor("student-1", Role.STUDENT),
      "student-1",
    ),
  );
  assert.throws(
    () =>
      assertCanAccessRecommendation(
        actor("student-2", Role.STUDENT),
        "student-1",
      ),
    AuthorizationError,
  );
  assert.throws(
    () =>
      assertCanAccessRecommendation(
        actor("teacher-1", Role.TEACHER),
        "student-1",
      ),
    AuthorizationError,
  );
});
