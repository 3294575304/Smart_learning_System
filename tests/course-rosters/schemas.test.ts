import assert from "node:assert/strict";
import test from "node:test";
import {
  rosterMutationSchema,
  rosterQuerySchema,
} from "@/services/course-rosters/schemas";

test("roster mutations validate text student numbers and prohibit account credential changes", () => {
  const id = "cmembership000000000000000";
  assert.equal(
    rosterMutationSchema.parse({
      action: "ADD",
      classroomId: id,
      studentNo: " ００１ab ",
      name: "测试学生",
    }).action,
    "ADD",
  );
  const parsed = rosterMutationSchema.parse({
    action: "ADD",
    classroomId: id,
    studentNo: " ００１ab ",
    name: "测试学生",
  });
  assert.ok(parsed.action === "ADD");
  assert.equal(parsed.studentNo, "001AB");
  assert.equal(
    rosterMutationSchema.safeParse({
      action: "EDIT_MEMBER",
      membershipId: id,
      expectedUpdatedAt: new Date().toISOString(),
      name: "测试学生",
      studentNo: "NEW",
    }).success,
    false,
  );
  assert.equal(
    rosterMutationSchema.safeParse({
      action: "ADD",
      classroomId: id,
      studentNo: "1e+10",
      name: "测试学生",
    }).success,
    false,
  );
  assert.equal(rosterQuerySchema.safeParse({ page: 0 }).success, false);
});
