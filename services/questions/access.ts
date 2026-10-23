import "server-only";

import { QuestionStatus, Prisma } from "@prisma/client";

import { ResourceNotFoundError } from "@/services/auth/policy";

export function teacherQuestionAccessWhere(
  teacherId: string,
): Prisma.QuestionWhereInput {
  return {
    OR: [
      { creatorId: teacherId },
      {
        questionCategory: {
          courses: {
            some: { teacherId, status: { not: "ARCHIVED" } },
          },
        },
      },
      {
        categoryCourse: {
          teacherId,
          status: { not: "ARCHIVED" },
        },
      },
    ],
  };
}

export async function requireTeacherQuestionAccess(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  questionId: string,
): Promise<void> {
  const question = await transaction.question.findFirst({
    where: {
      id: questionId,
      deletedAt: null,
      status: { in: [QuestionStatus.ACTIVE, QuestionStatus.DRAFT] },
      ...teacherQuestionAccessWhere(teacherId),
    },
    select: { id: true },
  });
  if (!question) throw new ResourceNotFoundError("题目不存在");
}
