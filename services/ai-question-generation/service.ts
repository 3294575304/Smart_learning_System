import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  AuditAction,
  AuditTargetType,
  Prisma,
  QuestionStatus,
  QuestionType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AuditRequestContext } from "@/services/audit/types";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import { createBackgroundJob } from "@/services/background-jobs/repository";
import { AIQuestionGenerationError } from "@/services/ai-question-generation/errors";
import {
  AI_QUESTION_JOB_TYPE,
  AI_QUESTION_PROMPT_VERSION,
  AI_QUESTION_RULE_VERSION,
  candidateActionSchema,
  confirmAllCandidatesSchema,
  editCandidateSchema,
  questionGenerationRequestSchema,
  type QuestionGenerationRequest,
} from "@/services/ai-question-generation/schemas";
import { extractQuestionFile } from "@/services/question-import/file-extractor";
import { createProgrammingConfigInTransaction } from "@/services/programming-questions/service";
import { programmingConfigRevisionInputSchema } from "@/services/programming-questions/schemas";
import { createQuestionInTransaction } from "@/services/questions/service";
import { questionUpsertSchema } from "@/services/questions/schemas";
import { getStorageService } from "@/services/storage";
import { verifyProgrammingCandidate } from "@/services/ai-question-generation/verify-programming";

export const FILE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function ownedCourse(teacherId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      questionCategoryId: true,
      currentPublishedKnowledgeGraphVersionId: true,
      currentPublishedSyllabusStructureId: true,
      questionCategory: { select: { isActive: true } },
    },
  });
  if (!course) throw new AIQuestionGenerationError("课程不存在", 404);
  if (!course.questionCategory.isActive)
    throw new AIQuestionGenerationError("课程分类已停用", 409);
  return course;
}

async function ownedBatch(teacherId: string, batchId: string) {
  const batch = await prisma.aIQuestionGenerationBatch.findFirst({
    where: { id: batchId, teacherId, course: { teacherId } },
    include: {
      candidates: { orderBy: { ordinal: "asc" } },
      job: { select: { status: true, progress: true, errorCode: true } },
    },
  });
  if (!batch) throw new AIQuestionGenerationError("生成任务不存在", 404);
  return batch;
}

export async function listGenerationOptions(teacherId: string) {
  const courses = await prisma.course.findMany({
    where: {
      teacherId,
      status: { not: "ARCHIVED" },
      questionCategory: { isActive: true },
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      term: true,
      questionCategoryId: true,
      currentPublishedKnowledgeGraphVersion: {
        select: {
          id: true,
          nodes: {
            where: { nodeType: { in: ["CHAPTER", "KNOWLEDGE_POINT"] } },
            orderBy: [{ sortOrder: "asc" }],
            select: {
              id: true,
              conceptId: true,
              code: true,
              name: true,
              nodeType: true,
              sourcePath: true,
            },
          },
        },
      },
    },
  });
  const categories = [
    ...new Set(courses.map((item) => item.questionCategoryId)),
  ];
  const sourceQuestions = await prisma.question.findMany({
    where: {
      questionCategoryId: { in: categories },
      deletedAt: null,
      status: QuestionStatus.ACTIVE,
      isAssignmentOnly: false,
    },
    take: 200,
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, questionCategoryId: true, title: true, type: true },
  });
  return { courses, sourceQuestions };
}

async function validateRange(
  course: Awaited<ReturnType<typeof ownedCourse>>,
  input: QuestionGenerationRequest,
) {
  if (input.mode === "RANGE" && !course.currentPublishedKnowledgeGraphVersionId)
    throw new AIQuestionGenerationError(
      "按范围生成需要先发布课程知识图谱",
      409,
    );
  if (!input.chapterCode && input.conceptIds.length === 0) return;
  const graphVersionId = course.currentPublishedKnowledgeGraphVersionId;
  if (!graphVersionId)
    throw new AIQuestionGenerationError("该课程没有可选的正式目录", 409);
  let chapterNodeId: string | null = null;
  if (input.chapterCode) {
    const chapter = await prisma.publishedKnowledgeGraphNode.findFirst({
      where: { graphVersionId, nodeType: "CHAPTER", code: input.chapterCode },
      select: { id: true },
    });
    if (!chapter)
      throw new AIQuestionGenerationError("所选目录已变化，请刷新", 409);
    chapterNodeId = chapter.id;
  }
  if (input.conceptIds.length) {
    const count = await prisma.publishedKnowledgeGraphNode.count({
      where: {
        graphVersionId,
        nodeType: "KNOWLEDGE_POINT",
        conceptId: { in: input.conceptIds },
        ...(chapterNodeId
          ? {
              incomingEdges: {
                some: {
                  fromNodeId: chapterNodeId,
                  relationType: "CONTAINS" as const,
                },
              },
            }
          : {}),
      },
    });
    if (count !== input.conceptIds.length)
      throw new AIQuestionGenerationError(
        "所选知识点不在当前目录或已变化，请刷新",
        409,
      );
  }
}

export async function queueQuestionGeneration(
  teacherId: string,
  rawInput: unknown,
  file: File | null,
  context: AuditRequestContext,
) {
  const parsed = questionGenerationRequestSchema.safeParse(rawInput);
  if (!parsed.success)
    throw new AIQuestionGenerationError(
      parsed.error.issues[0]?.message ?? "出题参数无效",
    );
  const input = parsed.data;
  if (file && (file.size < 1 || file.size > 20 * 1024 * 1024))
    throw new AIQuestionGenerationError("文件必须大于 0 且不能超过 20 MB", 413);
  const existing = await prisma.aIQuestionGenerationBatch.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: {
      id: true,
      teacherId: true,
      request: true,
      sourceFileChecksum: true,
      status: true,
    },
  });
  if (existing) {
    const suppliedChecksum = file
      ? createHash("sha256")
          .update(Buffer.from(await file.arrayBuffer()))
          .digest("hex")
      : null;
    if (
      existing.teacherId !== teacherId ||
      canonicalJson(existing.request) !== canonicalJson(input) ||
      existing.sourceFileChecksum !== suppliedChecksum
    )
      throw new AIQuestionGenerationError("重复请求参数不一致", 409);
    return { id: existing.id, status: existing.status };
  }
  const course = await ownedCourse(teacherId, input.courseId);
  await validateRange(course, input);
  if (input.mode === "ANALOGY") {
    const source = await prisma.question.findFirst({
      where: {
        id: input.sourceQuestionId!,
        questionCategoryId: course.questionCategoryId,
        status: QuestionStatus.ACTIVE,
        deletedAt: null,
        isAssignmentOnly: false,
      },
      select: { id: true },
    });
    if (!source)
      throw new AIQuestionGenerationError(
        "原题不存在或不属于当前课程分类",
        404,
      );
  }
  if ((input.mode === "FILE") !== Boolean(file))
    throw new AIQuestionGenerationError(
      input.mode === "FILE" ? "请上传出题文件" : "当前模式不接受文件",
    );

  let source: Awaited<ReturnType<typeof extractQuestionFile>> | null = null;
  let storageKey: string | null = null;
  if (file) {
    if (file.name.toLowerCase().endsWith(".txt")) {
      const bytes = await file.arrayBuffer();
      let decoded: string;
      try {
        decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new AIQuestionGenerationError("TXT 文件必须使用 UTF-8 编码");
      }
      if (decoded.includes("\u0000"))
        throw new AIQuestionGenerationError("TXT 文件包含无效二进制内容");
    }
    source = await extractQuestionFile(file);
    if (!["PDF", "DOCX", "DOC", "TXT"].includes(source.format))
      throw new AIQuestionGenerationError("仅支持 PDF、DOCX、DOC 和 TXT 文件");
    const allowedMime: Record<string, string[]> = {
      PDF: ["application/pdf"],
      DOCX: [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      DOC: ["application/msword"],
      TXT: ["text/plain"],
    };
    const mime = file.type.toLowerCase();
    if (
      mime &&
      mime !== "application/octet-stream" &&
      !allowedMime[source.format]?.includes(mime)
    )
      throw new AIQuestionGenerationError("文件 MIME 类型与实际格式不一致");
    storageKey = `ai-question-source/${course.id}/${randomUUID()}.${source.format.toLowerCase()}`;
    await getStorageService().save(
      storageKey,
      Buffer.from(await file.arrayBuffer()),
    );
  }

  try {
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.aIQuestionGenerationBatch.create({
        data: {
          courseId: course.id,
          teacherId,
          questionCategoryId: course.questionCategoryId,
          graphVersionId: course.currentPublishedKnowledgeGraphVersionId,
          syllabusStructureId: course.currentPublishedSyllabusStructureId,
          mode: input.mode,
          idempotencyKey: input.idempotencyKey,
          request: input as unknown as Prisma.InputJsonObject,
          requestedCount: Object.values(input.counts).reduce(
            (sum, count) => sum + count,
            0,
          ),
          promptVersion: AI_QUESTION_PROMPT_VERSION,
          ruleVersion: AI_QUESTION_RULE_VERSION,
          sourceFileName: source?.fileName,
          sourceFileFormat: source?.format,
          sourceFileChecksum: source?.checksum,
          sourceFileSizeBytes: source?.size,
          sourceFileStorageKey: storageKey,
          sourceFileExpiresAt: source
            ? new Date(Date.now() + FILE_LIFETIME_MS)
            : null,
        },
      });
      const job = await createBackgroundJob(
        {
          type: AI_QUESTION_JOB_TYPE,
          requestedById: teacherId,
          courseId: course.id,
          idempotencyKey: `${created.id}:1`,
          input: { batchId: created.id, generationRevision: 1 },
          maxAttempts: 3,
        },
        tx,
      );
      await tx.aIQuestionGenerationBatch.update({
        where: { id: created.id },
        data: { jobId: job.id },
      });
      await writeGovernanceAuditLog(tx, {
        actorId: teacherId,
        action: AuditAction.AI_QUESTION_BATCH_CREATED,
        targetType: AuditTargetType.AI_QUESTION_BATCH,
        targetId: created.id,
        summary: `创建 AI 出题任务：${input.mode}`,
        beforeData: null,
        afterData: {
          courseId: course.id,
          mode: input.mode,
          requestedCount: created.requestedCount,
          sourceFileChecksum: source?.checksum ?? null,
        },
        context,
      });
      return created;
    });
    return { id: batch.id, status: batch.status };
  } catch (error) {
    if (storageKey)
      await getStorageService()
        .delete(storageKey)
        .catch(() => undefined);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await prisma.aIQuestionGenerationBatch.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: {
          id: true,
          teacherId: true,
          request: true,
          sourceFileChecksum: true,
          status: true,
        },
      });
      if (
        winner &&
        winner.teacherId === teacherId &&
        canonicalJson(winner.request) === canonicalJson(input) &&
        winner.sourceFileChecksum === (source?.checksum ?? null)
      )
        return { id: winner.id, status: winner.status };
      throw new AIQuestionGenerationError("重复请求参数不一致", 409);
    }
    throw error;
  }
}

export async function getQuestionGenerationBatch(
  teacherId: string,
  batchId: string,
) {
  const batch = await ownedBatch(teacherId, batchId);
  const { sourceFileStorageKey: _secret, ...visible } = batch;
  void _secret;
  return visible;
}

export async function listQuestionGenerationBatches(teacherId: string) {
  return prisma.aIQuestionGenerationBatch.findMany({
    where: { teacherId, course: { teacherId } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      mode: true,
      status: true,
      requestedCount: true,
      generatedCount: true,
      failedCount: true,
      createdAt: true,
      course: { select: { name: true } },
    },
  });
}

export async function editQuestionCandidate(
  teacherId: string,
  batchId: string,
  candidateId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const input = editCandidateSchema.safeParse(raw);
  if (!input.success)
    throw new AIQuestionGenerationError(
      input.error.issues[0]?.message ?? "候选题无效",
    );
  const batch = await ownedBatch(teacherId, batchId);
  const candidate = batch.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new AIQuestionGenerationError("候选题不存在", 404);
  if (
    candidate.status !== "REVIEW" ||
    candidate.revision !== input.data.expectedRevision
  )
    throw new AIQuestionGenerationError("候选题已变化，请刷新", 409);
  if (input.data.question.questionCategoryId !== batch.questionCategoryId)
    throw new AIQuestionGenerationError("课程分类不可修改", 409);
  if (
    (input.data.question.type === QuestionType.PYTHON_PROGRAMMING) !==
    Boolean(input.data.programmingConfig)
  )
    throw new AIQuestionGenerationError(
      "编程题必须提供判题配置，其他题型不能包含该配置",
    );
  const knownIds = new Set(
    (candidate.sourceRefs as Array<{ id: string }>).map((ref) => ref.id),
  );
  if (input.data.sourceIds.some((id) => !knownIds.has(id)))
    throw new AIQuestionGenerationError("来源引用不属于此候选题");
  await prisma.$transaction(async (tx) => {
    const result = await tx.aIQuestionGenerationCandidate.updateMany({
      where: {
        id: candidateId,
        batchId,
        revision: candidate.revision,
        status: "REVIEW",
      },
      data: {
        questionJson: input.data.question as unknown as Prisma.InputJsonObject,
        programmingConfig:
          (input.data.programmingConfig as unknown as Prisma.InputJsonObject) ??
          Prisma.DbNull,
        sourceRefs: (candidate.sourceRefs as Array<{ id: string }>).filter(
          (ref) => input.data.sourceIds.includes(ref.id),
        ) as Prisma.InputJsonObject[],
        reviewHistory: [
          ...(candidate.reviewHistory as Prisma.InputJsonObject[]),
          {
            revision: candidate.revision,
            questionJson: candidate.questionJson,
            programmingConfig: candidate.programmingConfig,
            sourceRefs: candidate.sourceRefs,
            replacedAt: new Date().toISOString(),
            replacedById: teacherId,
          } as Prisma.InputJsonObject,
        ],
        revision: { increment: 1 },
      },
    });
    if (result.count !== 1)
      throw new AIQuestionGenerationError("候选题已变化，请刷新", 409);
    await writeGovernanceAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.AI_QUESTION_CANDIDATE_EDITED,
      targetType: AuditTargetType.AI_QUESTION_BATCH,
      targetId: batchId,
      summary: `修改候选题 ${candidate.ordinal}，修订 ${candidate.revision + 1}`,
      beforeData: { candidateId, revision: candidate.revision },
      afterData: { candidateId, revision: candidate.revision + 1 },
      context,
    });
  });
  return { revision: candidate.revision + 1 };
}

export async function discardQuestionCandidate(
  teacherId: string,
  batchId: string,
  candidateId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const parsed = candidateActionSchema.safeParse(raw);
  if (!parsed.success)
    throw new AIQuestionGenerationError("请刷新候选题后重试");
  const batch = await ownedBatch(teacherId, batchId);
  const candidate = batch.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new AIQuestionGenerationError("候选题不存在", 404);
  if (
    candidate.status !== "REVIEW" ||
    candidate.revision !== parsed.data.expectedRevision
  )
    throw new AIQuestionGenerationError("候选题已变化，请刷新", 409);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.aIQuestionGenerationCandidate.updateMany({
      where: {
        id: candidateId,
        batchId,
        status: "REVIEW",
        revision: parsed.data.expectedRevision,
      },
      data: { status: "DISCARDED", revision: { increment: 1 } },
    });
    if (updated.count !== 1)
      throw new AIQuestionGenerationError("候选题已变化，请刷新", 409);
    await writeGovernanceAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.AI_QUESTION_CANDIDATE_DISCARDED,
      targetType: AuditTargetType.AI_QUESTION_BATCH,
      targetId: batchId,
      summary: `丢弃候选题 ${candidate.ordinal}`,
      beforeData: null,
      afterData: { candidateId },
      context,
    });
  });
  return { status: "DISCARDED" };
}

export async function confirmQuestionCandidate(
  teacherId: string,
  batchId: string,
  candidateId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const parsed = candidateActionSchema.safeParse(raw);
  if (!parsed.success)
    throw new AIQuestionGenerationError("请刷新候选题后重试");
  const batch = await ownedBatch(teacherId, batchId);
  const candidate = batch.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new AIQuestionGenerationError("候选题不存在", 404);
  if (candidate.status === "CONFIRMED" && candidate.confirmedQuestionId)
    return { questionId: candidate.confirmedQuestionId, status: "CONFIRMED" };
  if (
    candidate.status !== "REVIEW" ||
    candidate.revision !== parsed.data.expectedRevision
  )
    throw new AIQuestionGenerationError("候选题已变化，请刷新", 409);
  const question = questionUpsertSchema.parse(candidate.questionJson);
  const config =
    candidate.programmingConfig === null
      ? null
      : programmingConfigRevisionInputSchema.parse(candidate.programmingConfig);
  if ((question.type === QuestionType.PYTHON_PROGRAMMING) !== Boolean(config))
    throw new AIQuestionGenerationError("判题配置与题型不匹配");
  if (config) await verifyProgrammingCandidate(config);
  const course = await ownedCourse(teacherId, batch.courseId);
  if (
    course.questionCategoryId !== batch.questionCategoryId ||
    course.currentPublishedKnowledgeGraphVersionId !== batch.graphVersionId
  )
    throw new AIQuestionGenerationError(
      "课程分类或正式图谱已变化，请重新核对后生成",
      409,
    );
  let graphNode: { id: string; conceptId: string } | null = null;
  const primaryConceptId =
    parsed.data.primaryConceptId === undefined
      ? candidate.primaryConceptId
      : parsed.data.primaryConceptId;
  if (primaryConceptId) {
    if (!batch.graphVersionId)
      throw new AIQuestionGenerationError("该课程尚无正式知识图谱", 409);
    graphNode = await prisma.publishedKnowledgeGraphNode.findFirst({
      where: {
        graphVersionId: batch.graphVersionId,
        conceptId: primaryConceptId,
        nodeType: "KNOWLEDGE_POINT",
      },
      select: { id: true, conceptId: true },
    });
    if (!graphNode)
      throw new AIQuestionGenerationError("知识点已变化，请刷新", 409);
  }
  try {
    return await prisma.$transaction(
      async (tx) => {
        const locked = await tx.aIQuestionGenerationCandidate.findFirst({
          where: {
            id: candidateId,
            batchId,
            status: "REVIEW",
            revision: parsed.data.expectedRevision,
          },
          select: { id: true },
        });
        if (!locked)
          throw new AIQuestionGenerationError("候选题已变化，请刷新", 409);
        const currentCourse = await tx.course.findFirst({
          where: { id: batch.courseId, teacherId, status: { not: "ARCHIVED" } },
          select: {
            questionCategoryId: true,
            currentPublishedKnowledgeGraphVersionId: true,
          },
        });
        if (
          !currentCourse ||
          currentCourse.questionCategoryId !== batch.questionCategoryId ||
          currentCourse.currentPublishedKnowledgeGraphVersionId !==
            batch.graphVersionId
        )
          throw new AIQuestionGenerationError(
            "课程分类或正式图谱已变化，请重新核对",
            409,
          );
        const createdId = await createQuestionInTransaction(
          tx,
          teacherId,
          question,
          config ? QuestionStatus.DRAFT : undefined,
        );
        if (config)
          await createProgrammingConfigInTransaction(
            tx,
            teacherId,
            createdId,
            config,
            context,
          );
        if (graphNode && batch.graphVersionId) {
          const set = await tx.questionKnowledgeGraphBindingSet.create({
            data: { questionId: createdId, courseId: batch.courseId },
          });
          await tx.questionKnowledgeGraphBinding.create({
            data: {
              bindingSetId: set.id,
              questionId: createdId,
              courseId: batch.courseId,
              conceptId: graphNode.conceptId,
              sourceGraphVersionId: batch.graphVersionId,
              sourceNodeId: graphNode.id,
              bindingType: "PRIMARY",
              createdById: teacherId,
            },
          });
        }
        const updated = await tx.aIQuestionGenerationCandidate.updateMany({
          where: {
            id: candidateId,
            status: "REVIEW",
            revision: parsed.data.expectedRevision,
          },
          data: {
            status: "CONFIRMED",
            confirmedQuestionId: createdId,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new AIQuestionGenerationError("候选题已变化，请刷新", 409);
        await writeGovernanceAuditLog(tx, {
          actorId: teacherId,
          action: AuditAction.AI_QUESTION_CANDIDATE_CONFIRMED,
          targetType: AuditTargetType.QUESTION,
          targetId: createdId,
          summary: `确认 AI 出题候选 ${candidate.ordinal}`,
          beforeData: null,
          afterData: {
            batchId,
            candidateId,
            graphVersionId: batch.graphVersionId,
            primaryConceptId: graphNode?.conceptId ?? null,
            sourceIds: (candidate.sourceRefs as Array<{ id: string }>).map(
              (ref) => ref.id,
            ),
          },
          context,
        });
        return { questionId: createdId, status: "CONFIRMED" };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    ) {
      const settled = await prisma.aIQuestionGenerationCandidate.findUnique({
        where: { id: candidateId },
        select: { status: true, confirmedQuestionId: true },
      });
      if (settled?.status === "CONFIRMED" && settled.confirmedQuestionId)
        return {
          questionId: settled.confirmedQuestionId,
          status: "CONFIRMED",
        };
      throw new AIQuestionGenerationError("候选题正在更新，请刷新后重试", 409);
    }
    throw error;
  }
}

export async function confirmAllQuestionCandidates(
  teacherId: string,
  batchId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const parsed = confirmAllCandidatesSchema.safeParse(raw);
  if (!parsed.success) throw new AIQuestionGenerationError("批量审核参数无效");
  const batch = await ownedBatch(teacherId, batchId);
  if (!["READY", "PARTIAL"].includes(batch.status))
    throw new AIQuestionGenerationError("请等待生成任务完成后再批量入库", 409);
  const pending = batch.candidates.filter((item) => item.status === "REVIEW");
  const entries = parsed.data.candidates;
  if (
    pending.length !== entries.length ||
    new Set(entries.map((item) => item.id)).size !== entries.length ||
    pending.some(
      (item) =>
        !entries.some(
          (entry) =>
            entry.id === item.id && entry.expectedRevision === item.revision,
        ),
    )
  )
    throw new AIQuestionGenerationError("候选题已变化，请刷新后重新审核", 409);
  const confirmed: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];
  for (const entry of entries) {
    try {
      const result = await confirmQuestionCandidate(
        teacherId,
        batchId,
        entry.id,
        entry,
        context,
      );
      confirmed.push(result.questionId);
    } catch (error) {
      if (!(error instanceof AIQuestionGenerationError))
        console.error("[ai-question-confirm-all-failed]", {
          batchId,
          candidateId: entry.id,
          errorType: error instanceof Error ? error.name : "unknown",
        });
      failed.push({
        id: entry.id,
        reason:
          error instanceof AIQuestionGenerationError
            ? error.message
            : "入库失败，请单独检查该题",
      });
    }
  }
  return { confirmedCount: confirmed.length, failed };
}

export async function retryQuestionGeneration(
  teacherId: string,
  batchId: string,
) {
  const batch = await ownedBatch(teacherId, batchId);
  const course = await ownedCourse(teacherId, batch.courseId);
  if (
    course.questionCategoryId !== batch.questionCategoryId ||
    course.currentPublishedKnowledgeGraphVersionId !== batch.graphVersionId
  )
    throw new AIQuestionGenerationError(
      "课程分类或正式图谱已变化，请重新核对后生成",
      409,
    );
  if (batch.status !== "FAILED" && batch.failedCount === 0)
    throw new AIQuestionGenerationError("当前任务无需重试", 409);
  if (batch.sourceFileStorageKey && batch.sourceFileDeletedAt)
    throw new AIQuestionGenerationError("原始文件已过期，请重新上传", 409);
  const revision = batch.generationRevision + 1;
  await prisma.$transaction(async (tx) => {
    const reserved = await tx.aIQuestionGenerationBatch.updateMany({
      where: {
        id: batch.id,
        generationRevision: batch.generationRevision,
        status: { in: ["FAILED", "PARTIAL"] },
      },
      data: {
        generationRevision: revision,
        status: "PENDING",
        errorCode: null,
        failureDetails: [],
      },
    });
    if (reserved.count !== 1)
      throw new AIQuestionGenerationError("任务已被其他请求重试，请刷新", 409);
    const job = await createBackgroundJob(
      {
        type: AI_QUESTION_JOB_TYPE,
        requestedById: teacherId,
        courseId: batch.courseId,
        idempotencyKey: `${batch.id}:${revision}`,
        input: { batchId: batch.id, generationRevision: revision },
        maxAttempts: 3,
      },
      tx,
    );
    await tx.aIQuestionGenerationBatch.update({
      where: { id: batch.id },
      data: {
        jobId: job.id,
      },
    });
  });
  return { id: batch.id, status: "PENDING" };
}

export async function deleteExpiredQuestionSourceFiles(now = new Date()) {
  const batches = await prisma.aIQuestionGenerationBatch.findMany({
    where: {
      sourceFileExpiresAt: { lte: now },
      sourceFileDeletedAt: null,
      status: { in: ["READY", "PARTIAL", "FAILED"] },
    },
    select: { id: true, sourceFileStorageKey: true },
  });
  let deleted = 0;
  for (const batch of batches) {
    if (!batch.sourceFileStorageKey) continue;
    await getStorageService().delete(batch.sourceFileStorageKey);
    await prisma.aIQuestionGenerationBatch.update({
      where: { id: batch.id },
      data: { sourceFileDeletedAt: now },
    });
    deleted += 1;
  }
  return deleted;
}
