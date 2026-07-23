import assert from "node:assert/strict";
import test from "node:test";
import { QuestionVisibility } from "@prisma/client";

import { AuthorizationError } from "@/services/auth/policy";
import {
  assertTeacherCanEditQuestion,
  assertTeacherQuestionIsPrivate,
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

test("教师创建或更新请求不能提交公共可见性", () => {
  assert.doesNotThrow(() =>
    assertTeacherQuestionIsPrivate(QuestionVisibility.PRIVATE),
  );
  assert.throws(
    () => assertTeacherQuestionIsPrivate(QuestionVisibility.PUBLIC),
    /公共题库由管理员维护/,
  );
});

test("教师不能继续编辑历史公共题目", () => {
  assert.throws(
    () =>
      assertTeacherCanEditQuestion(
        {
          creatorId: "teacher-1",
          visibility: QuestionVisibility.PUBLIC,
        },
        "teacher-1",
      ),
    /联系管理员撤销公共状态/,
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
