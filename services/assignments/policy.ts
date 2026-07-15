import {
  AssignmentStatus,
  ClassroomStatus,
  MembershipStatus,
  QuestionStatus,
  QuestionVisibility,
} from "@prisma/client";

import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import { AssignmentOperationError } from "@/services/assignments/errors";

export function assertTeacherOwnsClassroom(
  teacherId: string,
  classroom: { teacherId: string; status: ClassroomStatus } | null,
): void {
  if (!classroom || classroom.teacherId !== teacherId) {
    throw new ResourceNotFoundError("班级不存在");
  }
  if (classroom.status !== ClassroomStatus.ACTIVE) {
    throw new AssignmentOperationError("只能向有效班级发布作业");
  }
}

export function canTeacherUseQuestion(
  teacherId: string,
  question: {
    creatorId: string;
    visibility: QuestionVisibility;
    status: QuestionStatus;
    deletedAt: Date | null;
  },
): boolean {
  return (
    question.status === QuestionStatus.ACTIVE &&
    question.deletedAt === null &&
    (question.creatorId === teacherId ||
      question.visibility === QuestionVisibility.PUBLIC)
  );
}

export function assertActiveMembership(
  membership: { status: MembershipStatus } | null,
): void {
  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    throw new ResourceNotFoundError("作业不存在");
  }
}

export function assertAssignmentIsVisible(
  assignment: {
    status: AssignmentStatus;
    publishedAt: Date | null;
  },
  now: Date,
): void {
  if (
    assignment.status !== AssignmentStatus.PUBLISHED ||
    !assignment.publishedAt ||
    assignment.publishedAt > now
  ) {
    throw new ResourceNotFoundError("作业不存在");
  }
}

export function assertAssignmentAcceptsWork(
  assignment: {
    status: AssignmentStatus;
    publishedAt: Date | null;
    dueAt: Date | null;
  },
  now: Date,
): void {
  assertAssignmentIsVisible(assignment, now);
  if (!assignment.dueAt || assignment.dueAt <= now) {
    throw new AssignmentOperationError("作业已截止，不能继续保存或提交");
  }
}

export function assertCanStartAttempt(
  allowResubmission: boolean,
  submittedAttemptCount: number,
): void {
  if (!allowResubmission && submittedAttemptCount > 0) {
    throw new AssignmentOperationError("该作业不允许重复提交");
  }
}

export function assertDraftAssignment(
  teacherId: string,
  assignment: { teacherId: string; status: AssignmentStatus } | null,
): void {
  if (!assignment || assignment.teacherId !== teacherId) {
    throw new ResourceNotFoundError("作业不存在");
  }
  if (assignment.status !== AssignmentStatus.DRAFT) {
    throw new AuthorizationError("已发布作业已冻结，不能修改");
  }
}
