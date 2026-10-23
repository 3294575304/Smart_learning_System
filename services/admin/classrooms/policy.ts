import { ClassroomStatus } from "@prisma/client";

import { GovernanceOperationError } from "@/services/admin/governance-errors";

export function assertAdminCanCloseClassroom(status: ClassroomStatus): void {
  if (
    status !== ClassroomStatus.ACTIVE &&
    status !== ClassroomStatus.COMPLETED
  ) {
    throw new GovernanceOperationError(
      "仅授课中或已结课的班级可以由管理员关闭",
    );
  }
}
