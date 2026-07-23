import assert from "node:assert/strict";
import test from "node:test";
import {
  ClassroomStatus,
  QuestionStatus,
  QuestionVisibility,
  Role,
} from "@prisma/client";

import { assertAdminCanCloseClassroom } from "@/services/admin/classrooms/policy";
import { adminClassroomListQuerySchema } from "@/services/admin/classrooms/schemas";
import { assertQuestionVisibilityCanChange } from "@/services/admin/questions/policy";
import {
  adminQuestionListQuerySchema,
  disableAdminQuestionSchema,
  updateAdminQuestionVisibilitySchema,
} from "@/services/admin/questions/schemas";
import { assertRole, AuthorizationError } from "@/services/auth/policy";
import type { AuthenticatedUser } from "@/services/auth/types";

test("管理员题库筛选支持关键词、题型、知识点、创建者和分页", () => {
  const parsed = adminQuestionListQuerySchema.parse({
    page: "2",
    pageSize: "10",
    keyword: " 方程 ",
    knowledgePointId: "cmath00000000000000000001",
    creatorId: "cteach000000000000000001",
  });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.pageSize, 10);
  assert.equal(parsed.keyword, "方程");
});

test("管理员可以设置和撤销公共题目，异常题目不能公开", () => {
  assert.doesNotThrow(() =>
    assertQuestionVisibilityCanChange({
      currentVisibility: QuestionVisibility.PRIVATE,
      nextVisibility: QuestionVisibility.PUBLIC,
      status: QuestionStatus.ACTIVE,
      knowledgePointCount: 1,
    }),
  );
  assert.doesNotThrow(() =>
    assertQuestionVisibilityCanChange({
      currentVisibility: QuestionVisibility.PUBLIC,
      nextVisibility: QuestionVisibility.PRIVATE,
      status: QuestionStatus.INACTIVE,
      knowledgePointCount: 1,
    }),
  );
  assert.throws(() =>
    assertQuestionVisibilityCanChange({
      currentVisibility: QuestionVisibility.PRIVATE,
      nextVisibility: QuestionVisibility.PUBLIC,
      status: QuestionStatus.INACTIVE,
      knowledgePointCount: 1,
    }),
  );
});

test("治理状态接口只接受明确的白名单状态", () => {
  assert.equal(
    updateAdminQuestionVisibilitySchema.safeParse({
      visibility: QuestionVisibility.PUBLIC,
    }).success,
    true,
  );
  assert.equal(
    disableAdminQuestionSchema.safeParse({
      status: QuestionStatus.ARCHIVED,
    }).success,
    false,
  );
});

test("管理员班级查询分页且只有开启班级可关闭", () => {
  assert.equal(adminClassroomListQuerySchema.parse({}).page, 1);
  assert.doesNotThrow(() =>
    assertAdminCanCloseClassroom(ClassroomStatus.ACTIVE),
  );
  assert.throws(() => assertAdminCanCloseClassroom(ClassroomStatus.CLOSED));
});

test("学生和教师不能调用管理员治理能力", () => {
  const user = (role: Role): AuthenticatedUser => ({
    id: "cm12345678901234567890123",
    email: `${role.toLowerCase()}@example.com`,
    displayName: role,
    role,
  });
  assert.throws(
    () => assertRole(user(Role.STUDENT), [Role.ADMIN]),
    AuthorizationError,
  );
  assert.throws(
    () => assertRole(user(Role.TEACHER), [Role.ADMIN]),
    AuthorizationError,
  );
  assert.doesNotThrow(() => assertRole(user(Role.ADMIN), [Role.ADMIN]));
});
