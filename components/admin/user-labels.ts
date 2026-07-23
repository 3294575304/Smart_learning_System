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
  SYSTEM_CONFIG_UPDATED: "更新系统配置",
  MAINTENANCE_MODE_ENABLED: "开启维护模式",
  MAINTENANCE_MODE_DISABLED: "关闭维护模式",
  AI_FEATURE_ENABLED: "开启 AI 功能",
  AI_FEATURE_DISABLED: "关闭 AI 功能",
  ANNOUNCEMENT_CREATED: "创建公告",
  ANNOUNCEMENT_UPDATED: "更新公告",
  ANNOUNCEMENT_PUBLISHED: "发布公告",
  SUBMISSION_GRADING_COMPLETED: "完成提交批改",
  ASSIGNMENT_RESULTS_PUBLISHED: "发布作业成绩",
  QUESTION_MADE_PUBLIC: "题目设为公共",
  QUESTION_MADE_PRIVATE: "撤销题目公共状态",
  QUESTION_DISABLED: "停用题目",
  CLASSROOM_CLOSED_BY_ADMIN: "管理员关闭班级",
};
