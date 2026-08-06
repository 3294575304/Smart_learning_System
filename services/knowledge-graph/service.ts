import {
  AuditAction,
  AuditTargetType,
  KnowledgeGraphStatus,
  Prisma,
} from "@prisma/client";
import { ZodError } from "zod";

import { prisma } from "@/lib/prisma";
import { createAIProvider } from "@/services/ai/provider-factory";
import type { AIProvider } from "@/services/ai/provider";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import {
  KNOWLEDGE_GRAPH_AI_TIMEOUT_MS,
  KNOWLEDGE_GRAPH_GENERATOR_VERSION,
  KNOWLEDGE_GRAPH_MAX_AI_ATTEMPTS,
  KNOWLEDGE_GRAPH_PROMPT_VERSION,
  KNOWLEDGE_GRAPH_RULE_VERSION,
} from "@/services/knowledge-graph/constants";
import { KnowledgeGraphOperationError } from "@/services/knowledge-graph/errors";
import {
  currentPublishedSyllabusOrThrow,
  getCurrentPublishedSyllabusForKnowledgeGraph,
  loadTeacherCourseForKnowledgeGraph,
} from "@/services/knowledge-graph/syllabus-source";
import { findOrCreateTeacherKnowledgeGraphDraft } from "@/services/knowledge-graph/task-repository";
import {
  deterministicGraph,
  mergeRelated,
} from "@/services/knowledge-graph/generator";
import {
  knowledgeGraphStructureSchema,
  relatedInferenceSchema,
  type KnowledgeGraphStructure,
} from "@/services/knowledge-graph/schemas";
import { validateKnowledgeGraph } from "@/services/knowledge-graph/validation";
import { publishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
async function courseOrThrow(
  teacherId: string,
  courseId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const course = await client.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      currentPublishedSyllabusStructureId: true,
      currentPublishedKnowledgeGraphVersionId: true,
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  return course;
}
function parseGraph(value: unknown): KnowledgeGraphStructure {
  const parsed = knowledgeGraphStructureSchema.safeParse(value);
  if (!parsed.success)
    throw new KnowledgeGraphOperationError(
      "已保存的知识图谱结构无效。",
      500,
      "STORED_GRAPH_INVALID",
    );
  validateKnowledgeGraph(parsed.data);
  return parsed.data;
}

async function infer(provider: AIProvider, base: KnowledgeGraphStructure) {
  if (!provider.inferKnowledgeGraphRelations)
    throw new KnowledgeGraphOperationError(
      "当前 AI Provider 不支持知识图谱关系推断。",
      502,
      "PROVIDER_UNSUPPORTED",
    );
  let last: unknown;
  for (
    let attempt = 0;
    attempt < KNOWLEDGE_GRAPH_MAX_AI_ATTEMPTS;
    attempt += 1
  ) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      KNOWLEDGE_GRAPH_AI_TIMEOUT_MS,
    );
    try {
      const raw = await provider.inferKnowledgeGraphRelations(base, {
        signal: controller.signal,
        validationError: last instanceof Error ? last.message : undefined,
      });
      const parsed = relatedInferenceSchema.parse(
        typeof raw === "string" ? JSON.parse(raw) : raw,
      );
      return { inference: parsed, retryCount: attempt };
    } catch (error) {
      last = error;
    } finally {
      clearTimeout(timer);
    }
  }
  const code =
    last instanceof DOMException && last.name === "AbortError"
      ? "PROVIDER_TIMEOUT"
      : last instanceof ZodError || last instanceof SyntaxError
        ? "INVALID_PROVIDER_OUTPUT"
        : "PROVIDER_ERROR";
  throw new KnowledgeGraphOperationError(
    "知识图谱 AI 推断失败，请稍后重试。",
    502,
    code,
  );
}

export async function generateTeacherKnowledgeGraph(
  teacherId: string,
  courseId: string,
  context: AuditRequestContext,
  dependencies: { provider?: AIProvider } = {},
) {
  const source = await getCurrentPublishedSyllabusForKnowledgeGraph(
    teacherId,
    courseId,
  );
  let draft = await prisma.knowledgeGraphDraft.findUnique({
    where: {
      sourceSyllabusStructureId_generatorVersion: {
        sourceSyllabusStructureId: source.id,
        generatorVersion: KNOWLEDGE_GRAPH_GENERATOR_VERSION,
      },
    },
  });
  if (draft?.status === KnowledgeGraphStatus.SUCCEEDED)
    return {
      reused: true,
      draft: { ...draft, structure: parseGraph(draft.generatedStructureJson) },
    };
  if (draft?.status === KnowledgeGraphStatus.PROCESSING)
    return { reused: true, draft };
  draft =
    draft ??
    (await prisma.knowledgeGraphDraft.upsert({
      where: {
        sourceSyllabusStructureId_generatorVersion: {
          sourceSyllabusStructureId: source.id,
          generatorVersion: KNOWLEDGE_GRAPH_GENERATOR_VERSION,
        },
      },
      create: {
        courseId,
        sourceSyllabusStructureId: source.id,
        requestedById: teacherId,
        generatorVersion: KNOWLEDGE_GRAPH_GENERATOR_VERSION,
        promptVersion: KNOWLEDGE_GRAPH_PROMPT_VERSION,
        ruleVersion: KNOWLEDGE_GRAPH_RULE_VERSION,
      },
      update: {},
    }));
  const claimed = await prisma.knowledgeGraphDraft.updateMany({
    where: {
      id: draft.id,
      status: {
        in: [KnowledgeGraphStatus.PENDING, KnowledgeGraphStatus.FAILED],
      },
    },
    data: {
      status: KnowledgeGraphStatus.PROCESSING,
      requestedById: teacherId,
      executionCount: { increment: 1 },
      progress: 10,
      errorCode: null,
      startedAt: new Date(),
      completedAt: null,
    },
  });
  if (claimed.count !== 1)
    return {
      reused: true,
      draft: await prisma.knowledgeGraphDraft.findUniqueOrThrow({
        where: { id: draft.id },
      }),
    };
  const provider = dependencies.provider ?? createAIProvider();
  try {
    const syllabus = publishableSyllabusStructureSchema.parse(
      source.structureJson,
    );
    const base = deterministicGraph(courseId, syllabus);
    await prisma.knowledgeGraphDraft.update({
      where: { id: draft.id },
      data: { deterministicStructureJson: json(base), progress: 45 },
    });
    const ai = await infer(provider, base);
    const structure = mergeRelated(base, ai.inference);
    const saved = await prisma.knowledgeGraphDraft.update({
      where: { id: draft.id },
      data: {
        status: KnowledgeGraphStatus.SUCCEEDED,
        provider: provider.name,
        model: provider.model,
        retryCount: ai.retryCount,
        aiInferenceJson: json(ai.inference),
        generatedStructureJson: json(structure),
        progress: 100,
        successCount: structure.nodes.length + structure.edges.length,
        failureCount: 0,
        completedAt: new Date(),
      },
    });
    await writeGovernanceAuditLog(prisma, {
      actorId: teacherId,
      action: AuditAction.KNOWLEDGE_GRAPH_GENERATED,
      targetType: AuditTargetType.KNOWLEDGE_GRAPH_DRAFT,
      targetId: saved.id,
      summary: "生成知识图谱草稿",
      beforeData: null,
      afterData: {
        courseId,
        sourceSyllabusStructureId: source.id,
        generatorVersion: KNOWLEDGE_GRAPH_GENERATOR_VERSION,
      },
      context,
    });
    return { reused: false, draft: { ...saved, structure } };
  } catch (error) {
    await prisma.knowledgeGraphDraft.update({
      where: { id: draft.id },
      data: {
        status: KnowledgeGraphStatus.FAILED,
        provider: provider.name,
        model: provider.model,
        progress: 100,
        failureCount: 1,
        generatedStructureJson: Prisma.JsonNull,
        errorCode:
          error instanceof KnowledgeGraphOperationError
            ? error.code
            : "GRAPH_GENERATION_FAILED",
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function queueTeacherKnowledgeGraph(
  teacherId: string,
  courseId: string,
) {
  const draft = await findOrCreateTeacherKnowledgeGraphDraft(
    teacherId,
    courseId,
  );
  return {
    reused:
      draft.status === KnowledgeGraphStatus.SUCCEEDED ||
      draft.status === KnowledgeGraphStatus.PROCESSING,
    shouldExecute:
      draft.status === KnowledgeGraphStatus.PENDING ||
      draft.status === KnowledgeGraphStatus.FAILED,
    draft,
  };
}

function protectedEvidence(
  graph: KnowledgeGraphStructure,
): Map<string, string> {
  return new Map<string, string>([
    ...graph.nodes.map(
      (n) =>
        [
          `node:${n.key}`,
          JSON.stringify({
            conceptKey: n.conceptKey,
            sourceType: n.sourceType,
            sourceRefs: n.sourceRefs,
            sourcePath: n.sourcePath,
          }),
        ] as const,
    ),
    ...graph.edges.map(
      (e) =>
        [
          `edge:${e.key}`,
          JSON.stringify({
            sourceType: e.sourceType,
            sourceRefs: e.sourceRefs,
          }),
        ] as const,
    ),
  ]);
}
function validateEvidence(
  next: KnowledgeGraphStructure,
  original: KnowledgeGraphStructure,
) {
  const allowed = protectedEvidence(original);
  for (const [key, value] of protectedEvidence(next)) {
    if (allowed.has(key) && allowed.get(key) !== value)
      throw new KnowledgeGraphOperationError(
        "大纲来源证据和来源类型不可修改。",
        400,
        "SOURCE_EVIDENCE_MODIFIED",
      );
    if (!allowed.has(key) && value.includes('"SYLLABUS"'))
      throw new KnowledgeGraphOperationError(
        "教师新增节点或关系不能声明为大纲来源。",
        400,
        "SOURCE_EVIDENCE_MODIFIED",
      );
  }
}

export async function saveTeacherKnowledgeGraphReview(
  teacherId: string,
  courseId: string,
  draftId: string,
  input: { expectedRevisionNumber: number; structure: KnowledgeGraphStructure },
  context: AuditRequestContext,
) {
  validateKnowledgeGraph(input.structure);
  return prisma.$transaction(async (tx) => {
    await courseOrThrow(teacherId, courseId, tx);
    const draft = await tx.knowledgeGraphDraft.findFirst({
      where: { id: draftId, courseId },
    });
    if (!draft) throw new ResourceNotFoundError("知识图谱草稿不存在。");
    if (draft.status !== KnowledgeGraphStatus.SUCCEEDED)
      throw new KnowledgeGraphOperationError(
        "只有生成成功的图谱才能审核。",
        409,
        "GRAPH_GENERATION_NOT_SUCCEEDED",
      );
    const original = parseGraph(draft.generatedStructureJson);
    validateEvidence(input.structure, original);
    const latest = await tx.knowledgeGraphReviewRevision.findFirst({
      where: { graphDraftId: draftId },
      orderBy: { revisionNumber: "desc" },
    });
    if ((latest?.revisionNumber ?? 0) !== input.expectedRevisionNumber)
      throw new KnowledgeGraphOperationError(
        "审核稿已被更新，请重新加载。",
        409,
        "GRAPH_REVISION_CONFLICT",
      );
    const saved = await tx.knowledgeGraphReviewRevision.create({
      data: {
        courseId,
        graphDraftId: draftId,
        sourceSyllabusStructureId: draft.sourceSyllabusStructureId,
        editedById: teacherId,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
        structureJson: json(input.structure),
      },
    });
    await writeGovernanceAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.KNOWLEDGE_GRAPH_REVIEW_SAVED,
      targetType: AuditTargetType.KNOWLEDGE_GRAPH_REVIEW,
      targetId: saved.id,
      summary: `保存知识图谱审核修订 ${saved.revisionNumber}`,
      beforeData: latest ? { revisionNumber: latest.revisionNumber } : null,
      afterData: {
        courseId,
        graphDraftId: draftId,
        revisionNumber: saved.revisionNumber,
      },
      context,
    });
    return { ...saved, structure: input.structure };
  });
}

export async function getTeacherKnowledgeGraph(
  teacherId: string,
  courseId: string,
) {
  const course = await loadTeacherCourseForKnowledgeGraph(teacherId, courseId);
  const currentSource = course.currentPublishedSyllabusStructure;
  const isCurrentSourceUsable = Boolean(
    currentSource &&
      course.syllabi[0] &&
      currentSource.syllabusId === course.syllabi[0].id,
  );
  const currentSourceId =
    isCurrentSourceUsable && currentSource ? currentSource.id : null;
  const [draft, published] = await Promise.all([
    currentSourceId
      ? prisma.knowledgeGraphDraft.findUnique({
          where: {
            sourceSyllabusStructureId_generatorVersion: {
              sourceSyllabusStructureId: currentSourceId,
              generatorVersion: KNOWLEDGE_GRAPH_GENERATOR_VERSION,
            },
          },
        })
      : null,
    prisma.publishedKnowledgeGraphVersion.findMany({
      where: { courseId },
      orderBy: { versionNumber: "desc" },
    }),
  ]);
  const review = draft
    ? await prisma.knowledgeGraphReviewRevision.findFirst({
        where: { graphDraftId: draft.id },
        orderBy: { revisionNumber: "desc" },
      })
    : null;
  const mapDraft = draft
    ? {
        ...draft,
        structure: draft.generatedStructureJson
          ? parseGraph(draft.generatedStructureJson)
          : null,
      }
    : null;
  const history = published.map((item) => ({
    ...item,
    structure: parseGraph(item.structureJson),
    isSourceCurrent: item.sourceSyllabusStructureId === currentSourceId,
  }));
  return {
    sourceSyllabusStructureId: currentSourceId,
    isSyllabusSourceStale: Boolean(
      course.currentPublishedSyllabusStructureId && !isCurrentSourceUsable,
    ),
    draft: mapDraft,
    review: review
      ? { ...review, structure: parseGraph(review.structureJson) }
      : null,
    published: {
      current:
        history.find(
          (x) => x.id === course.currentPublishedKnowledgeGraphVersionId,
        ) ?? null,
      history,
    },
  };
}

async function publishKnowledgeGraphTransaction(
  teacherId: string,
  courseId: string,
  draftId: string,
  reviewRevisionId: string,
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (tx) => {
      let course = await courseOrThrow(teacherId, courseId, tx);
      const existing = await tx.publishedKnowledgeGraphVersion.findUnique({
        where: { reviewRevisionId },
      });
      if (existing)
        return { ...existing, structure: parseGraph(existing.structureJson) };
      await tx.$queryRaw`SELECT "id" FROM "Course" WHERE "id" = ${courseId} FOR UPDATE`;
      course = await courseOrThrow(teacherId, courseId, tx);
      const currentSyllabusStructure = currentPublishedSyllabusOrThrow(
        await loadTeacherCourseForKnowledgeGraph(teacherId, courseId, tx),
      );
      const draft = await tx.knowledgeGraphDraft.findFirst({
        where: { id: draftId, courseId },
      });
      if (!draft) throw new ResourceNotFoundError("知识图谱草稿不存在。");
      if (
        draft.sourceSyllabusStructureId !==
        currentSyllabusStructure.id
      )
        throw new KnowledgeGraphOperationError(
          "该图谱草稿来自旧正式大纲，请重新生成。",
          409,
          "GRAPH_SOURCE_SYLLABUS_STALE",
        );
      const review = await tx.knowledgeGraphReviewRevision.findFirst({
        where: { id: reviewRevisionId, graphDraftId: draftId, courseId },
      });
      if (!review) throw new ResourceNotFoundError("知识图谱审核修订不存在。");
      const latest = await tx.knowledgeGraphReviewRevision.findFirst({
        where: { graphDraftId: draftId },
        orderBy: { revisionNumber: "desc" },
        select: { id: true },
      });
      if (latest?.id !== review.id)
        throw new KnowledgeGraphOperationError(
          "只能发布最新审核修订。",
          409,
          "GRAPH_REVIEW_STALE",
        );
      const structure = parseGraph(review.structureJson);
      const previous = await tx.publishedKnowledgeGraphVersion.findFirst({
        where: { courseId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const version = await tx.publishedKnowledgeGraphVersion.create({
        data: {
          courseId,
          sourceSyllabusStructureId: draft.sourceSyllabusStructureId,
          graphDraftId: draft.id,
          reviewRevisionId: review.id,
          publishedById: teacherId,
          versionNumber: (previous?.versionNumber ?? 0) + 1,
          structureJson: json(structure),
        },
      });
      const nodeIds = new Map<string, string>();
      for (const node of structure.nodes) {
        const concept = await tx.knowledgeGraphConcept.upsert({
          where: {
            courseId_stableKey: { courseId, stableKey: node.conceptKey },
          },
          create: { courseId, stableKey: node.conceptKey },
          update: {},
        });
        const saved = await tx.publishedKnowledgeGraphNode.create({
          data: {
            graphVersionId: version.id,
            conceptId: concept.id,
            nodeType: node.type,
            code: node.code,
            name: node.name,
            description: node.description,
            importance: node.importance,
            isKeyTopic: node.isKeyTopic,
            isDifficultTopic: node.isDifficultTopic,
            objectiveMappings: json(node.objectiveMappings),
            assessmentMappings: json(node.assessmentMappings),
            sourceType: node.sourceType,
            sourceRefs: json(node.sourceRefs),
            confidence: node.confidence,
            sourcePath: node.sourcePath,
            sortOrder: node.sortOrder,
          },
        });
        nodeIds.set(node.key, saved.id);
      }
      for (const edge of structure.edges)
        await tx.publishedKnowledgeGraphEdge.create({
          data: {
            graphVersionId: version.id,
            fromNodeId: nodeIds.get(edge.from)!,
            toNodeId: nodeIds.get(edge.to)!,
            relationType: edge.type,
            description: edge.description,
            sourceType: edge.sourceType,
            sourceRefs: json(edge.sourceRefs),
            confidence: edge.confidence,
          },
        });
      await tx.course.update({
        where: { id: courseId },
        data: { currentPublishedKnowledgeGraphVersionId: version.id },
      });
      await writeGovernanceAuditLog(tx, {
        actorId: teacherId,
        action: AuditAction.KNOWLEDGE_GRAPH_PUBLISHED,
        targetType: AuditTargetType.KNOWLEDGE_GRAPH_VERSION,
        targetId: version.id,
        summary: `发布知识图谱版本 ${version.versionNumber}`,
        beforeData: course.currentPublishedKnowledgeGraphVersionId
          ? {
              currentPublishedKnowledgeGraphVersionId:
                course.currentPublishedKnowledgeGraphVersionId,
            }
          : null,
        afterData: {
          courseId,
          versionNumber: version.versionNumber,
          sourceSyllabusStructureId: draft.sourceSyllabusStructureId,
        },
        context,
      });
      return { ...version, structure };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function publishTeacherKnowledgeGraph(
  teacherId: string,
  courseId: string,
  draftId: string,
  reviewRevisionId: string,
  context: AuditRequestContext,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await publishKnowledgeGraphTransaction(
        teacherId,
        courseId,
        draftId,
        reviewRevisionId,
        context,
      );
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" || error.code === "P2002")
      )
        continue;
      throw error;
    }
  }
  throw new KnowledgeGraphOperationError(
    "发布发生并发冲突，请重试。",
    409,
    "GRAPH_PUBLISH_CONFLICT",
  );
}

export function diffKnowledgeGraphs(
  from: KnowledgeGraphStructure,
  to: KnowledgeGraphStructure,
) {
  const compare = <T extends { conceptKey?: string; key: string }>(
    left: T[],
    right: T[],
    identity: (x: T) => string,
  ) => {
    const a = new Map(left.map((x) => [identity(x), x]));
    const b = new Map(right.map((x) => [identity(x), x]));
    return {
      added: [...b].filter(([k]) => !a.has(k)).map(([, v]) => v),
      removed: [...a].filter(([k]) => !b.has(k)).map(([, v]) => v),
      modified: [...b]
        .filter(
          ([k, v]) =>
            a.has(k) && JSON.stringify(a.get(k)) !== JSON.stringify(v),
        )
        .map(([k, v]) => ({ before: a.get(k), after: v })),
    };
  };
  return {
    nodes: compare(from.nodes, to.nodes, (x) => x.conceptKey),
    edges: compare(from.edges, to.edges, (x) => `${x.type}:${x.from}:${x.to}`),
  };
}

export async function getTeacherKnowledgeGraphDiff(
  teacherId: string,
  courseId: string,
  fromId: string,
  toId: string,
) {
  await courseOrThrow(teacherId, courseId);
  const records = await prisma.publishedKnowledgeGraphVersion.findMany({
    where: { courseId, id: { in: [fromId, toId] } },
  });
  if (records.length !== 2)
    throw new ResourceNotFoundError("知识图谱版本不存在。");
  const byId = new Map(records.map((x) => [x.id, parseGraph(x.structureJson)]));
  return diffKnowledgeGraphs(byId.get(fromId)!, byId.get(toId)!);
}
