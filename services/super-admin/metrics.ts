import { Role, UserStatus } from "@prisma/client";

export function summarizePlatformUsers(
  rows: Array<{
    role: Role;
    status: UserStatus;
    _count: { _all: number };
  }>,
) {
  const roles = [
    { role: Role.SUPER_ADMIN, label: "超级管理员" },
    { role: Role.ADMIN, label: "高校管理员" },
    { role: Role.TEACHER, label: "教师" },
    { role: Role.STUDENT, label: "学生" },
  ].map(({ role, label }) => {
    const groups = rows.filter((group) => group.role === role);
    return {
      role,
      label,
      total: groups.reduce((sum, group) => sum + group._count._all, 0),
      enabled: groups
        .filter((group) => group.status === UserStatus.ACTIVE)
        .reduce((sum, group) => sum + group._count._all, 0),
    };
  });
  const total = roles.reduce((sum, role) => sum + role.total, 0);
  const enabled = roles.reduce((sum, role) => sum + role.enabled, 0);
  return { total, enabled, disabled: total - enabled, roles };
}
