import assert from "node:assert/strict";
import test from "node:test";
import { Role } from "@prisma/client";

import {
  assertRole,
  AuthenticationError,
  AuthorizationError,
  getErrorStatus,
  ResourceNotFoundError,
  roleHomePath,
} from "@/services/auth/policy";
import type { AuthenticatedUser } from "@/services/auth/types";

function userWithRole(role: Role): AuthenticatedUser {
  return {
    id: "cm12345678901234567890123",
    email: `${role.toLowerCase()}@example.com`,
    role,
    displayName: role,
    mustChangePassword: false,
  };
}

test("允许角色匹配的用户", () => {
  assert.doesNotThrow(() => {
    assertRole(userWithRole(Role.TEACHER), [Role.TEACHER]);
  });
});

test("学生访问教师能力时返回 403 类型错误", () => {
  assert.throws(
    () => assertRole(userWithRole(Role.STUDENT), [Role.TEACHER]),
    AuthorizationError,
  );
});

test("认证、授权和资源不存在映射为安全状态码", () => {
  assert.equal(getErrorStatus(new AuthenticationError()), 401);
  assert.equal(getErrorStatus(new AuthorizationError()), 403);
  assert.equal(getErrorStatus(new ResourceNotFoundError()), 404);
  assert.equal(getErrorStatus(new Error("database detail")), 500);
});

test("三种角色跳转到各自工作台", () => {
  assert.equal(roleHomePath(Role.ADMIN), "/admin");
  assert.equal(roleHomePath(Role.TEACHER), "/teacher");
  assert.equal(roleHomePath(Role.STUDENT), "/student");
});
