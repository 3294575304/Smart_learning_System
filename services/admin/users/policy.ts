import { Role, UserStatus } from "@prisma/client";

import { AdminUserOperationError } from "@/services/admin/users/errors";
import type { RoleBoundRecordCounts } from "@/services/admin/users/types";

interface ProtectedUserState {
  id: string;
  role: Role;
  status: UserStatus;
}

function assertAnotherActiveAdminRemains(
  target: ProtectedUserState,
  activeAdminCount: number,
): void {
  if (
    target.role === Role.ADMIN &&
    target.status === UserStatus.ACTIVE &&
    activeAdminCount <= 1
  ) {
    throw new AdminUserOperationError("系统中必须至少保留一个可用管理员");
  }
}

export function assertCanChangeUserRole(
  actorId: string,
  target: ProtectedUserState,
  nextRole: Role,
  activeAdminCount: number,
): void {
  if (target.role === nextRole) return;
  if (target.id === actorId && target.role === Role.ADMIN) {
    throw new AdminUserOperationError("不能降低自己的管理员角色");
  }
  if (target.role === Role.ADMIN && nextRole !== Role.ADMIN) {
    assertAnotherActiveAdminRemains(target, activeAdminCount);
  }
}

export function assertCanChangeUserStatus(
  actorId: string,
  target: ProtectedUserState,
  nextStatus: UserStatus,
  activeAdminCount: number,
): void {
  if (target.status === nextStatus) return;
  if (target.id === actorId && nextStatus === UserStatus.INACTIVE) {
    throw new AdminUserOperationError("不能禁用自己的账号");
  }
  if (nextStatus === UserStatus.INACTIVE) {
    assertAnotherActiveAdminRemains(target, activeAdminCount);
  }
}

export function assertRoleTransitionHasNoBoundData(
  currentRole: Role,
  nextRole: Role,
  counts: RoleBoundRecordCounts,
): void {
  if (currentRole === nextRole || currentRole === Role.ADMIN) return;

  const hasTeacherData =
    counts.taughtClassrooms > 0 ||
    counts.assignments > 0 ||
    counts.createdQuestions > 0;
  const hasStudentData =
    counts.classMemberships > 0 ||
    counts.submissions > 0 ||
    counts.wrongQuestions > 0 ||
    counts.knowledgeMasteries > 0 ||
    counts.personalizedRecommendations > 0 ||
    counts.aiTutoringRecords > 0;

  if (
    (currentRole === Role.TEACHER && hasTeacherData) ||
    (currentRole === Role.STUDENT && hasStudentData)
  ) {
    throw new AdminUserOperationError(
      "该用户已有与当前角色关联的业务数据，暂不能直接变更角色",
    );
  }
}
