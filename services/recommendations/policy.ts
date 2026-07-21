import { ClassroomStatus, MembershipStatus, Role } from "@prisma/client";

import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import type { AuthenticatedUser } from "@/services/auth/types";
import { RecommendationOperationError } from "@/services/recommendations/errors";

export interface RecommendationClassroomAccess {
  teacherId: string;
  status: ClassroomStatus;
  membershipStatus: MembershipStatus | null;
}

export function assertCanRecommendForStudent(
  actor: AuthenticatedUser,
  studentId: string,
  classroom: RecommendationClassroomAccess | null,
): asserts classroom is RecommendationClassroomAccess {
  if (!classroom) {
    throw new ResourceNotFoundError("班级不存在");
  }
  if (actor.role !== Role.STUDENT && actor.role !== Role.TEACHER) {
    throw new AuthorizationError("当前角色不能生成学生练习推荐");
  }
  if (
    (actor.role === Role.STUDENT && actor.id !== studentId) ||
    (actor.role === Role.TEACHER && actor.id !== classroom.teacherId)
  ) {
    throw new ResourceNotFoundError("学生或班级不存在");
  }
  if (classroom.membershipStatus !== MembershipStatus.ACTIVE) {
    throw new ResourceNotFoundError("学生不在该班级中");
  }
  if (classroom.status !== ClassroomStatus.ACTIVE) {
    throw new RecommendationOperationError("只能在有效班级中生成练习推荐");
  }
}
