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

export function assertTeacherQuestionIsPrivate(
  visibility: QuestionVisibility,
): void {
  if (visibility !== QuestionVisibility.PRIVATE) {
    throw new AuthorizationError("公共题库由管理员维护，教师只能保存私有题目");
  }
}

export function assertTeacherCanEditQuestion(
  question: {
    creatorId: string;
    visibility: QuestionVisibility;
  },
  teacherId: string,
): void {
  assertTeacherOwnsQuestion(teacherId, question);
  if (question.visibility === QuestionVisibility.PUBLIC) {
    throw new AuthorizationError(
      "该题目已进入公共题库，请联系管理员撤销公共状态后再编辑",
    );
  }
}
