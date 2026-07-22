import assert from "node:assert/strict";
import test from "node:test";
import { Role, UserStatus } from "@prisma/client";

import { AdminUserOperationError } from "@/services/admin/users/errors";
import {
  assertCanChangeUserRole,
  assertCanChangeUserStatus,
  assertRoleTransitionHasNoBoundData,
} from "@/services/admin/users/policy";
import type { RoleBoundRecordCounts } from "@/services/admin/users/types";

const emptyCounts: RoleBoundRecordCounts = {
  taughtClassrooms: 0,
  assignments: 0,
  createdQuestions: 0,
  classMemberships: 0,
  submissions: 0,
  wrongQuestions: 0,
  knowledgeMasteries: 0,
  personalizedRecommendations: 0,
  aiTutoringRecords: 0,
};

test("管理员不能禁用自己或降低自己的管理员角色", () => {
  const self = { id: "admin-1", role: Role.ADMIN, status: UserStatus.ACTIVE };
  assert.throws(
    () => assertCanChangeUserStatus("admin-1", self, UserStatus.INACTIVE, 2),
    AdminUserOperationError,
  );
  assert.throws(
    () => assertCanChangeUserRole("admin-1", self, Role.TEACHER, 2),
    AdminUserOperationError,
  );
});

test("系统不能移除最后一个可用管理员", () => {
  const target = { id: "admin-2", role: Role.ADMIN, status: UserStatus.ACTIVE };
  assert.throws(
    () => assertCanChangeUserStatus("admin-1", target, UserStatus.INACTIVE, 1),
    /至少保留一个可用管理员/,
  );
  assert.throws(
    () => assertCanChangeUserRole("admin-1", target, Role.STUDENT, 1),
    /至少保留一个可用管理员/,
  );
});

test("普通用户可启停，无业务数据时可变更角色", () => {
  const target = {
    id: "student-1",
    role: Role.STUDENT,
    status: UserStatus.ACTIVE,
  };
  assert.doesNotThrow(() =>
    assertCanChangeUserStatus("admin-1", target, UserStatus.INACTIVE, 1),
  );
  assert.doesNotThrow(() =>
    assertRoleTransitionHasNoBoundData(Role.STUDENT, Role.TEACHER, emptyCounts),
  );
});

test("已有角色绑定业务数据的用户不能直接跨角色修改", () => {
  assert.throws(
    () =>
      assertRoleTransitionHasNoBoundData(Role.TEACHER, Role.STUDENT, {
        ...emptyCounts,
        taughtClassrooms: 1,
      }),
    AdminUserOperationError,
  );
  assert.throws(
    () =>
      assertRoleTransitionHasNoBoundData(Role.STUDENT, Role.TEACHER, {
        ...emptyCounts,
        submissions: 1,
      }),
    AdminUserOperationError,
  );
});
