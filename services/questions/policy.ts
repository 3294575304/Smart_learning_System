import { QuestionVisibility } from "@prisma/client";

import { AuthorizationError } from "@/services/auth/policy";

export function canTeacherViewQuestion(
  teacherId: string,
  question: { creatorId: string; visibility: QuestionVisibility },
): boolean {
  return (
    question.creatorId === teacherId ||
    question.visibility === QuestionVisibility.PUBLIC
  );
}

export function assertTeacherOwnsQuestion(
  teacherId: string,
  question: { creatorId: string },
): void {
  if (question.creatorId !== teacherId) {
    throw new AuthorizationError("公共题目只能查看或复制，不能直接修改");
  }
}
