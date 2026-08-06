import { AssignmentConceptResolutionStatus, Prisma } from "@prisma/client";

export interface AssignmentConceptSnapshotResult {
  bindingCount: number;
  createdCount: number;
  resolvedCount: number;
  skippedCount: number;
}

export async function freezeAssignmentQuestionConcepts(
  transaction: Prisma.TransactionClient,
  assignmentId: string,
  courseId: string | null,
): Promise<AssignmentConceptSnapshotResult> {
  if (!courseId) {
    return {
      bindingCount: 0,
      createdCount: 0,
      resolvedCount: 0,
      skippedCount: 0,
    };
  }

  const [course, questions] = await Promise.all([
    transaction.course.findUnique({
      where: { id: courseId },
      select: { currentPublishedKnowledgeGraphVersionId: true },
    }),
    transaction.assignmentQuestion.findMany({
      where: { assignmentId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, questionId: true },
    }),
  ]);
  if (!course || questions.length === 0) {
    return {
      bindingCount: 0,
      createdCount: 0,
      resolvedCount: 0,
      skippedCount: 0,
    };
  }

  const questionIds = questions.map((question) => question.questionId);
  const bindingSets =
    await transaction.questionKnowledgeGraphBindingSet.findMany({
      where: { courseId, questionId: { in: questionIds } },
      select: {
        questionId: true,
        revision: true,
        bindings: {
          orderBy: [{ bindingType: "asc" }, { conceptId: "asc" }],
          select: {
            conceptId: true,
            bindingType: true,
            sourceGraphVersionId: true,
            sourceNodeId: true,
          },
        },
      },
    });
  const setByQuestion = new Map(
    bindingSets.map((set) => [set.questionId, set]),
  );
  const bindings = bindingSets.flatMap((set) => set.bindings);
  if (bindings.length === 0) {
    return {
      bindingCount: 0,
      createdCount: 0,
      resolvedCount: 0,
      skippedCount: 0,
    };
  }

  const currentGraphVersionId = course.currentPublishedKnowledgeGraphVersionId;
  const currentNodes = currentGraphVersionId
    ? await transaction.publishedKnowledgeGraphNode.findMany({
        where: {
          graphVersionId: currentGraphVersionId,
          conceptId: {
            in: [...new Set(bindings.map((binding) => binding.conceptId))],
          },
        },
        select: { id: true, conceptId: true },
      })
    : [];
  const currentNodeByConcept = new Map(
    currentNodes.map((node) => [node.conceptId, node.id]),
  );

  const rows = questions.flatMap((question) => {
    const set = setByQuestion.get(question.questionId);
    if (!set) return [];
    return set.bindings.map((binding) => {
      const resolvedNodeId =
        currentNodeByConcept.get(binding.conceptId) ?? null;
      const resolutionStatus = !currentGraphVersionId
        ? AssignmentConceptResolutionStatus.NO_CURRENT_PUBLISHED_GRAPH
        : resolvedNodeId
          ? AssignmentConceptResolutionStatus.RESOLVED
          : AssignmentConceptResolutionStatus.MISSING_FROM_PUBLISHED_GRAPH;
      return {
        assignmentId,
        assignmentQuestionId: question.id,
        questionId: question.questionId,
        courseId,
        conceptId: binding.conceptId,
        bindingType: binding.bindingType,
        bindingSetRevision: set.revision,
        sourceGraphVersionId: binding.sourceGraphVersionId,
        sourceNodeId: binding.sourceNodeId,
        publishedGraphVersionId: currentGraphVersionId,
        resolvedNodeId,
        resolutionStatus,
      };
    });
  });
  const result = await transaction.assignmentQuestionConceptSnapshot.createMany(
    { data: rows, skipDuplicates: true },
  );
  const resolvedCount = rows.filter(
    (row) =>
      row.resolutionStatus === AssignmentConceptResolutionStatus.RESOLVED,
  ).length;
  return {
    bindingCount: rows.length,
    createdCount: result.count,
    resolvedCount,
    skippedCount: rows.length - resolvedCount,
  };
}
