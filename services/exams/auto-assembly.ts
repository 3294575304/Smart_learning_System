import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { examQuestionHash } from "./fingerprint";
import { listEligibleExamQuestions } from "./service";
import type { z } from "zod";
import { examAutoAssembleSchema } from "./schemas";
import { selectExamAssemblyCandidates } from "./auto-assembly-selection";

type Input = z.output<typeof examAutoAssembleSchema>;

export async function autoAssembleExamQuestions(
  teacherId: string,
  input: Input,
) {
  const course = await prisma.course.findFirst({
    where: { id: input.courseId, teacherId, status: { not: "ARCHIVED" } },
    select: {
      questionCategoryId: true,
      currentPublishedKnowledgeGraphVersionId: true,
    },
  });
  if (
    !course?.questionCategoryId ||
    !course.currentPublishedKnowledgeGraphVersionId
  )
    throw new ResourceNotFoundError("课程或正式知识图谱不存在");

  const currentNodes = await prisma.publishedKnowledgeGraphNode.findMany({
    where: {
      graphVersionId: course.currentPublishedKnowledgeGraphVersionId,
      nodeType: "KNOWLEDGE_POINT",
      conceptId: { in: input.conceptIds },
    },
    select: { conceptId: true },
  });
  if (currentNodes.length !== input.conceptIds.length)
    throw new AssignmentOperationError("所选知识点已变化，请刷新页面", 409);

  const eligible = await listEligibleExamQuestions(teacherId, {
    courseId: input.courseId,
    startsAt: input.startsAt,
  });
  const eligibleIds = eligible
    .filter(
      (item) => !item.blocked && !input.excludeQuestionIds.includes(item.id),
    )
    .map((item) => item.id);
  const [questions, existing] = await Promise.all([
    prisma.question.findMany({
      where: {
        id: { in: eligibleIds },
        graphBindings: {
          some: {
            courseId: input.courseId,
            conceptId: { in: input.conceptIds },
          },
        },
      },
      include: {
        options: true,
        examImages: true,
        graphBindings: {
          where: {
            courseId: input.courseId,
            conceptId: { in: input.conceptIds },
          },
          select: { conceptId: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
    prisma.question.findMany({
      where: {
        id: { in: input.excludeQuestionIds },
        questionCategoryId: course.questionCategoryId,
      },
      include: { options: true, examImages: true },
    }),
  ]);
  const result = selectExamAssemblyCandidates(
    questions.map((question) => ({
      id: question.id,
      title: question.title,
      type: question.type,
      hash: examQuestionHash(question),
      conceptIds: question.graphBindings.map((binding) => binding.conceptId),
    })),
    input.conceptIds,
    input.counts,
    new Set(existing.map(examQuestionHash)),
  );
  return {
    questions: result.selected.map(({ id, title, type }) => ({
      id,
      title,
      type,
    })),
    shortages: result.shortages,
    coverage: result.coverage,
  };
}
