import assert from "node:assert/strict";
import test from "node:test";
import { QuestionVisibility } from "@prisma/client";

import { AuthorizationError } from "@/services/auth/policy";
import {
  assertTeacherOwnsQuestion,
  canTeacherViewQuestion,
} from "@/services/questions/policy";

test("教师可以查看自己的私有题和其他人的公共题", () => {
  assert.equal(
    canTeacherViewQuestion("teacher-1", {
      creatorId: "teacher-1",
      visibility: QuestionVisibility.PRIVATE,
    }),
    true,
  );
  assert.equal(
    canTeacherViewQuestion("teacher-1", {
      creatorId: "teacher-2",
      visibility: QuestionVisibility.PUBLIC,
    }),
    true,
  );
});

test("教师不能查看其他教师的私有题", () => {
  assert.equal(
    canTeacherViewQuestion("teacher-1", {
      creatorId: "teacher-2",
      visibility: QuestionVisibility.PRIVATE,
    }),
    false,
  );
});

test("只有创建教师可以修改或删除题目", () => {
  assert.doesNotThrow(() =>
    assertTeacherOwnsQuestion("teacher-1", { creatorId: "teacher-1" }),
  );
  assert.throws(
    () => assertTeacherOwnsQuestion("teacher-1", { creatorId: "teacher-2" }),
    AuthorizationError,
  );
});
