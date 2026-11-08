import "server-only";

import { prisma } from "@/lib/prisma";
import { createAIProvider } from "@/services/ai/provider-factory";
import type { AuditRequestContext } from "@/services/audit/types";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getSystemConfigValue } from "@/services/system-config/service";
import { assignmentEditorClassroomWhere } from "./creation-context";
import { AssignmentOperationError } from "./errors";
import { validateEditorAction } from "./editor-review";
import { assignmentReportingWhere } from "./reporting";
import { assertAssignmentResources } from "./service";
import {
  assemblyOutputSchema,
  type AssignmentAssemblyReview,
  type AssignmentPublicationPreview,
  type EditorAssistanceInput,
} from "./editor-assistance-schemas";

const recentDays = 90;
const assemblyRuleVersion = "assignment-assembly-1";
const assemblyPromptVersion = "assignment-assembly-prompt-1";

async function classroomsInScope(teacherId: string, ids: string[]) {
  const rooms = await prisma.classroom.findMany({
    where: { ...assignmentEditorClassroomWhere(teacherId), id: { in: ids } },
    select: { id: true, name: true, courseId: true },
  });
  if (rooms.length !== ids.length)
    throw new ResourceNotFoundError("课程或班级不存在");
  if (
    rooms.length > 1 &&
    (!rooms[0].courseId ||
      rooms.some((room) => room.courseId !== rooms[0].courseId))
  )
    throw new AssignmentOperationError("请选择同一课程的教学班", 400);
  return rooms.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

async function questionHistory(teacherId: string, ids: string[], now: Date) {
  const rows = await prisma.assignmentQuestion.findMany({
    where: {
      questionId: { in: ids },
      assignment: {
        teacherId,
        deletedAt: null,
        ...assignmentReportingWhere("ALL", now),
      },
    },
    select: {
      questionId: true,
      assignment: { select: { classroomId: true, publishedAt: true } },
    },
  });
  const byQuestion = new Map<
    string,
    { latest: Date; recentRooms: Set<string> }
  >();
  const recentFrom = now.getTime() - recentDays * 86400_000;
  for (const { questionId, assignment } of rows) {
    const date = assignment.publishedAt;
    if (!date) continue;
    const previous = byQuestion.get(questionId) ?? {
      latest: date,
      recentRooms: new Set<string>(),
    };
    if (date > previous.latest) previous.latest = date;
    if (date.getTime() >= recentFrom)
      previous.recentRooms.add(assignment.classroomId);
    byQuestion.set(questionId, previous);
  }
  return byQuestion;
}

export async function previewAssignmentPublication(
  teacherId: string,
  input: Extract<EditorAssistanceInput, { action: "PREFLIGHT" }>,
  now = new Date(),
): Promise<AssignmentPublicationPreview> {
  let data;
  try {
    data = validateEditorAction(input.assignment, true, now);
  } catch (error) {
    throw new AssignmentOperationError(
      error instanceof Error ? error.message : "请检查作业信息",
      400,
    );
  }
  const rooms = await classroomsInScope(teacherId, input.classroomIds);
  if (!input.classroomIds.includes(data.classroomId))
    throw new AssignmentOperationError("主班级须包含在发布班级中", 400);
  if (input.assignmentId) {
    const draft = await prisma.assignment.findFirst({
      where: {
        id: input.assignmentId,
        teacherId,
        status: "DRAFT",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!draft || rooms.length !== 1)
      throw new ResourceNotFoundError("作业草稿不存在");
  }
  const questionIds = data.questions.map((question) => question.questionId);
  if (rooms.length * Math.max(1, questionIds.length) > 400)
    throw new AssignmentOperationError(
      "单次最多复制400题次，请减少班级或题目后分批发布",
      400,
    );
  await assertAssignmentResources(
    prisma,
    teacherId,
    data,
    input.assignmentId,
    true,
  );
  const [names, history] = await Promise.all([
    prisma.assignment.groupBy({
      by: ["classroomId"],
      where: {
        teacherId,
        classroomId: { in: input.classroomIds },
        deletedAt: null,
        status: { in: ["PUBLISHED", "CLOSED", "ARCHIVED"] },
        title: { equals: data.title, mode: "insensitive" },
      },
      _count: true,
    }),
    questionHistory(teacherId, questionIds, now),
  ]);
  const totalPoints =
    data.submissionTask?.points ??
    data.questions.reduce(
      (sum, question) => sum + Math.round(question.points * 100),
      0,
    ) / 100;
  if (!Number.isFinite(totalPoints) || totalPoints <= 0)
    throw new AssignmentOperationError("请检查作业总分", 400);
  return {
    totalPoints,
    resourceCount: data.submissionTask?.resourceFileIds.length ?? 0,
    classrooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      sameTitleCount:
        names.find((entry) => entry.classroomId === room.id)?._count ?? 0,
      recentQuestionCount: questionIds.filter((id) =>
        history.get(id)?.recentRooms.has(room.id),
      ).length,
    })),
  };
}

export async function assembleAssignmentReview(
  teacherId: string,
  input: Extract<EditorAssistanceInput, { action: "ASSEMBLE" }>,
  context: AuditRequestContext,
  now = new Date(),
): Promise<AssignmentAssemblyReview> {
  const rooms = await classroomsInScope(teacherId, input.classroomIds);
  const courseId = rooms[0]?.courseId;
  if (!courseId)
    throw new AssignmentOperationError("请先选择已关联正式课程的教学班", 400);
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId, status: { not: "ARCHIVED" } },
    select: {
      questionCategoryId: true,
      currentPublishedKnowledgeGraphVersion: {
        select: {
          id: true,
          nodes: {
            where: {
              nodeType: "KNOWLEDGE_POINT",
              conceptId: { in: input.conceptIds },
            },
            select: { conceptId: true, name: true },
          },
        },
      },
    },
  });
  const graph = course?.currentPublishedKnowledgeGraphVersion;
  if (!course || !graph || graph.nodes.length !== input.conceptIds.length)
    throw new AssignmentOperationError("请选择当前课程正式图谱中的知识点", 400);
  const concepts = new Map(
    graph.nodes.map((node) => [node.conceptId, node.name]),
  );
  const binding = { courseId, conceptId: { in: input.conceptIds } };
  const candidates = await prisma.question.findMany({
    where: {
      id: { notIn: input.excludedIds },
      status: "ACTIVE",
      deletedAt: null,
      isAssignmentOnly: false,
      questionCategoryId: course.questionCategoryId,
      graphBindings: { some: binding },
      ...(input.types.length ? { type: { in: input.types } } : {}),
    },
    orderBy: [{ id: "asc" }],
    select: {
      id: true,
      title: true,
      type: true,
      graphBindings: { where: binding, select: { conceptId: true } },
    },
  });
  if (!candidates.length)
    throw new AssignmentOperationError(
      "所选范围没有可用的未选题，请调整条件",
      400,
    );
  const history = await questionHistory(
    teacherId,
    candidates.map((q) => q.id),
    now,
  );
  const choices = candidates.map((q) => ({
    ...q,
    conceptNames: q.graphBindings.map(
      ({ conceptId }) => concepts.get(conceptId) ?? conceptId,
    ),
    recentClassrooms: rooms
      .filter((room) => history.get(q.id)?.recentRooms.has(room.id))
      .map((room) => room.name),
    lastUsedAt: history.get(q.id)?.latest.toISOString() ?? null,
  }));
  const preferred = choices.sort(
    (a, b) =>
      a.recentClassrooms.length - b.recentClassrooms.length ||
      a.id.localeCompare(b.id),
  );
  const uncovered = new Set(input.conceptIds);
  const fallback = [];
  const remaining = new Set(preferred);
  for (let index = 0; index < input.count && remaining.size; index++) {
    const choice = [...remaining].reduce((best, item) => {
      const coverage = (q: typeof item) =>
        q.graphBindings.filter((point) => uncovered.has(point.conceptId))
          .length;
      return coverage(item) > coverage(best) ? item : best;
    });
    fallback.push(choice);
    remaining.delete(choice);
    for (const point of choice.graphBindings) uncovered.delete(point.conceptId);
  }
  const pool = [...new Set([...fallback, ...preferred])].slice(0, 120);
  const defaultReason = "根据已选知识点和历史用题记录推荐";
  let selection = fallback.map((q) => ({ q, reason: defaultReason }));
  let source: AssignmentAssemblyReview["source"] = "RULES";
  let model: string | null = null;
  let providerName: string | null = null;
  if (await getSystemConfigValue("aiAnalysisEnabled")) {
    try {
      const provider = createAIProvider();
      if (provider.assembleAssignment) {
        providerName = provider.name;
        model = provider.model;
        const response = assemblyOutputSchema.parse(
          await provider.assembleAssignment(
            {
              count: fallback.length,
              candidates: pool.map((q, index) => ({
                key: index + 1,
                title: q.title.slice(0, 100),
                type: q.type,
                concepts: q.conceptNames,
                recent: q.recentClassrooms.length > 0,
              })),
            },
            { signal: AbortSignal.timeout(9_000) },
          ),
        );
        const unique = new Set(response.picks.map((pick) => pick.key));
        if (
          unique.size === fallback.length &&
          response.picks.length === fallback.length &&
          response.picks.every((pick) => pick.key <= pool.length)
        ) {
          const suggested = response.picks.map((pick) => ({
            q: pool[pick.key - 1],
            reason: pick.reason,
          }));
          const covered = new Set(
            suggested.flatMap(({ q }) =>
              q.graphBindings.map((point) => point.conceptId),
            ),
          );
          const repeatCount = (items: typeof selection) =>
            items.filter(({ q }) => q.recentClassrooms.length > 0).length;
          if (
            covered.size >= input.conceptIds.length - uncovered.size &&
            repeatCount(suggested) <= repeatCount(selection)
          ) {
            selection = suggested;
            source = "AI";
          }
        }
      }
    } catch (error) {
      console.warn("Assignment assembly used rule fallback", {
        name: error instanceof Error ? error.name : "Unknown",
      });
    }
  }
  const covered = new Set(
    selection.flatMap(({ q }) =>
      q.graphBindings.map(({ conceptId }) => conceptId),
    ),
  );
  await writeGovernanceAuditLog(prisma, {
    actorId: teacherId,
    action: "ASSIGNMENT_ASSEMBLY_PREVIEWED",
    targetType: "COURSE",
    targetId: courseId,
    summary: "生成作业组卷预览",
    beforeData: null,
    context,
    afterData: {
      source,
      provider: providerName,
      model,
      promptVersion: assemblyPromptVersion,
      ruleVersion: assemblyRuleVersion,
      graphVersionId: graph.id,
      conceptIds: input.conceptIds,
      classroomIds: input.classroomIds,
      questionIds: selection.map(({ q }) => q.id),
      requested: input.count,
    },
  });
  const used = new Set(selection.map(({ q }) => q.id));
  const toReview = (q: (typeof choices)[number], reason: string) => ({
    id: q.id,
    title: q.title,
    type: q.type,
    conceptNames: q.conceptNames,
    lastUsedAt: q.lastUsedAt,
    recentClassrooms: q.recentClassrooms,
    reason,
  });
  return {
    source,
    requested: input.count,
    questions: selection.map(({ q, reason }) => toReview(q, reason)),
    alternatives: preferred
      .filter((q) => !used.has(q.id))
      .slice(0, 12)
      .map((q) => toReview(q, "符合所选条件的备选题")),
    missingConceptNames: graph.nodes
      .filter((node) => !covered.has(node.conceptId))
      .map((node) => node.name),
  };
}
