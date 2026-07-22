import type { AuditAction, Role, UserStatus } from "@prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "管理员",
  TEACHER: "教师",
  STUDENT: "学生",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "启用",
  INACTIVE: "禁用",
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  USER_CREATED: "创建用户",
  USER_UPDATED: "更新资料",
  USER_ROLE_CHANGED: "修改角色",
  USER_ENABLED: "启用用户",
  USER_DISABLED: "禁用用户",
};
