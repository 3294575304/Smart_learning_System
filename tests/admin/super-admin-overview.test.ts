import assert from "node:assert/strict";
import test from "node:test";
import { Role, UserStatus } from "@prisma/client";

import { assertRole, AuthorizationError } from "@/services/auth/policy";
import { summarizePlatformUsers } from "@/services/super-admin/metrics";

test("平台用户汇总包含禁用账号，并将高校管理员与超级管理员分开", () => {
  const summary = summarizePlatformUsers([
    { role: Role.SUPER_ADMIN, status: UserStatus.ACTIVE, _count: { _all: 1 } },
    { role: Role.ADMIN, status: UserStatus.ACTIVE, _count: { _all: 2 } },
    { role: Role.ADMIN, status: UserStatus.INACTIVE, _count: { _all: 1 } },
    { role: Role.STUDENT, status: UserStatus.ACTIVE, _count: { _all: 8 } },
    { role: Role.STUDENT, status: UserStatus.INACTIVE, _count: { _all: 3 } },
  ]);
  assert.equal(summary.total, 15);
  assert.equal(summary.enabled, 11);
  assert.equal(summary.disabled, 4);
  assert.equal(
    summary.roles.find((item) => item.role === Role.ADMIN)?.total,
    3,
  );
  assert.equal(
    summary.roles.find((item) => item.role === Role.SUPER_ADMIN)?.total,
    1,
  );
  assert.equal(
    summary.roles.find((item) => item.role === Role.TEACHER)?.total,
    0,
  );
});

test("空数据返回零值并保留全部角色分类", () => {
  const summary = summarizePlatformUsers([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.enabled, 0);
  assert.equal(summary.disabled, 0);
  assert.equal(summary.roles.length, 4);
  assert.ok(
    summary.roles.every((item) => item.total === 0 && item.enabled === 0),
  );
});

test("平台全局概览只对超级管理员开放", () => {
  for (const role of Object.values(Role)) {
    const user = {
      id: "user",
      email: null,
      displayName: null,
      role,
      mustChangePassword: false,
    };
    if (role === Role.SUPER_ADMIN) {
      assert.doesNotThrow(() => assertRole(user, [Role.SUPER_ADMIN]));
    } else {
      assert.throws(
        () => assertRole(user, [Role.SUPER_ADMIN]),
        AuthorizationError,
      );
    }
  }
});
