import { ClassroomStatus } from "@prisma/client";

import { GovernanceOperationError } from "@/services/admin/governance-errors";

export function assertAdminCanCloseClassroom(status: ClassroomStatus): void {
  if (status !== ClassroomStatus.ACTIVE) {
    throw new GovernanceOperationError("只有开启中的班级可以关闭");
  }
}
