import "server-only";

import { Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AdminQuestionListQuery } from "@/services/admin/questions/schemas";

const adminQuestionSelect = Prisma.validator<Prisma.QuestionSelect>()({
  id: true,
  title: true,
  content: true,
  type: true,
  difficulty: true,
  explanation: true,
  correctBoolean: true,
  referenceAnswer: true,
  acceptableAnswers: true,
  isCaseSensitive: true,
  status: true,
  visibility: true,
  tags: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  creator: {
    select: {
      id: true,
      email: true,
      role: true,
      profile: { select: { displayName: true } },
    },
  },
  options: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      label: true,
      content: true,
      isCorrect: true,
      sortOrder: true,
    },
  },
  knowledgePointLinks: {
    orderBy: { knowledgePoint: { name: "asc" } },
    select: {
      knowledgePoint: { select: { id: true, code: true, name: true } },
    },
  },
  _count: { select: { assignmentQuestions: true } },
});

export type AdminQuestionRecord = Prisma.QuestionGetPayload<{
  select: typeof adminQuestionSelect;
}>;
type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export async function loadAdminQuestionPage(query: AdminQuestionListQuery) {
  const where: Prisma.QuestionWhereInput = {
    deletedAt: null,
    ...(query.keyword
      ? {
          OR: [
            { title: { contains: query.keyword, mode: "insensitive" } },
            { content: { contains: query.keyword, mode: "insensitive" } },
            { tags: { has: query.keyword } },
          ],
        }
      : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.visibility ? { visibility: query.visibility } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.creatorId ? { creatorId: query.creatorId } : {}),
    ...(query.knowledgePointId
      ? {
          knowledgePointLinks: {
            some: { knowledgePointId: query.knowledgePointId },
          },
        }
      : {}),
  };
  const [total, records] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      select: adminQuestionSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { total, records };
}

export function findAdminQuestionById(
  questionId: string,
  client: DatabaseClient = prisma,
): Promise<AdminQuestionRecord | null> {
  return client.question.findFirst({
    where: { id: questionId, deletedAt: null },
    select: adminQuestionSelect,
  });
}

export async function loadQuestionCreatorOptions() {
  return prisma.user.findMany({
    where: {
      role: { in: [Role.ADMIN, Role.TEACHER] },
      createdQuestions: { some: { deletedAt: null } },
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      role: true,
      profile: { select: { displayName: true } },
    },
  });
}
