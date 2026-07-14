import { ClassroomStatus, MembershipStatus } from "@prisma/client";

import { ClassroomOperationError } from "@/services/classrooms/errors";

export function assertClassroomCanAcceptStudents(input: {
  status: ClassroomStatus;
  joinCodeExpiresAt: Date | null;
  now?: Date;
}): void {
  if (input.status !== ClassroomStatus.ACTIVE) {
    throw new ClassroomOperationError("该班级已经关闭，无法加入");
  }

  if (
    input.joinCodeExpiresAt &&
    input.joinCodeExpiresAt <= (input.now ?? new Date())
  ) {
    throw new ClassroomOperationError("邀请码已经失效");
  }
}

export function assertMembershipCanJoin(status: MembershipStatus | null): void {
  if (status === MembershipStatus.ACTIVE) {
    throw new ClassroomOperationError("你已经加入该班级");
  }

  if (status === MembershipStatus.REMOVED) {
    throw new ClassroomOperationError("你已被该班级移除，无法自行重新加入");
  }
}

export function assertStudentCanLeave(input: {
  membershipStatus: MembershipStatus;
  allowStudentLeave: boolean;
}): void {
  if (input.membershipStatus !== MembershipStatus.ACTIVE) {
    throw new ClassroomOperationError("你当前不在该班级中");
  }

  if (!input.allowStudentLeave) {
    throw new ClassroomOperationError("该班级不允许学生主动退出");
  }
}
