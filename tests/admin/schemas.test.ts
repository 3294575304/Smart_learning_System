import assert from "node:assert/strict";
import test from "node:test";
import { AuditAction, Role, UserStatus } from "@prisma/client";

import {
  adminUserListQuerySchema,
  createAdminUserSchema,
  updateAdminUserSchema,
} from "@/services/admin/users/schemas";
import { auditLogListQuerySchema } from "@/services/audit/schemas";

test("管理员用户查询应用分页、排序默认值并规范空筛选", () => {
  const defaults = adminUserListQuerySchema.parse({ role: "", status: "" });
  assert.equal(defaults.page, 1);
  assert.equal(defaults.pageSize, 20);
  assert.equal(defaults.sortBy, "createdAt");
  assert.equal(defaults.sortOrder, "desc");
  assert.equal(defaults.role, undefined);
  assert.equal(defaults.status, undefined);
  assert.equal(
    adminUserListQuerySchema.safeParse({ page: 0, pageSize: 51 }).success,
    false,
  );
  assert.equal(
    adminUserListQuerySchema.parse({ role: Role.TEACHER }).role,
    Role.TEACHER,
  );
});

test("创建用户校验强密码、受控角色并拒绝额外字段", () => {
  const valid = {
    displayName: "测试教师",
    email: " Teacher.New@Example.com ",
    password: "Teacher123!",
    role: Role.TEACHER,
  };
  assert.equal(
    createAdminUserSchema.parse(valid).email,
    "teacher.new@example.com",
  );
  assert.equal(
    createAdminUserSchema.safeParse({ ...valid, role: "OWNER" }).success,
    false,
  );
  assert.equal(
    createAdminUserSchema.safeParse({ ...valid, password: "weak" }).success,
    false,
  );
  assert.equal(
    createAdminUserSchema.safeParse({ ...valid, status: UserStatus.INACTIVE })
      .success,
    false,
  );
});

test("更新用户只接受白名单字段且至少包含一个字段", () => {
  assert.equal(updateAdminUserSchema.safeParse({}).success, false);
  assert.equal(
    updateAdminUserSchema.safeParse({ passwordHash: "secret" }).success,
    false,
  );
  assert.equal(
    updateAdminUserSchema.safeParse({ status: UserStatus.INACTIVE }).success,
    true,
  );
  const blankFields = updateAdminUserSchema.parse({
    displayName: "   ",
    email: "\t",
    status: UserStatus.ACTIVE,
  });
  assert.equal(blankFields.displayName, undefined);
  assert.equal(blankFields.email, undefined);
});

test("审计查询校验操作类型、时间范围和分页", () => {
  assert.equal(
    auditLogListQuerySchema.parse({ action: AuditAction.USER_CREATED }).action,
    AuditAction.USER_CREATED,
  );
  assert.equal(
    auditLogListQuerySchema.safeParse({ action: "PASSWORD_RESET" }).success,
    false,
  );
  assert.equal(
    auditLogListQuerySchema.safeParse({ from: "2026-07-22", to: "2026-07-21" })
      .success,
    false,
  );
  const sameDay = auditLogListQuerySchema.parse({
    from: "2026-07-22",
    to: "2026-07-22",
  });
  assert.ok(sameDay.to && sameDay.from && sameDay.to > sameDay.from);
});
