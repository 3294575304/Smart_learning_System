import "server-only";

import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { AuditAction, AuditTargetType, Prisma } from "@prisma/client";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { createBackgroundJob } from "@/services/background-jobs/repository";
import { getStorageService } from "@/services/storage";
import { questionUpsertSchema } from "@/services/questions/schemas";
import { storedPublishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";
import { EXAM_PAPER_JOB_TYPE, EXAM_PAPER_PROMPT_VERSION } from "./paper-ai";
import {
  paperDraftConfigSchema,
  paperDraftCropSchema,
  paperDraftOrderSchema,
  paperDraftQuestionEditSchema,
  paperDraftQuestionSchema,
  paperDraftReviewSchema,
} from "./paper-schemas";

export async function ownedPaperDraft(teacherId: string, draftId: string) {
  const draft = await prisma.examPaperDraft.findFirst({
    where: { id: draftId, teacherId },
  });
  if (!draft) throw new ResourceNotFoundError("考试草稿不存在");
  return draft;
}

async function lockEditableDraft(
  tx: Prisma.TransactionClient,
  teacherId: string,
  draftId: string,
) {
  await tx.$queryRaw`SELECT id FROM "ExamPaperDraft" WHERE id = ${draftId} FOR UPDATE`;
  const draft = await tx.examPaperDraft.findFirst({
    where: { id: draftId, teacherId, status: "READY" },
  });
  if (!draft)
    throw new AssignmentOperationError("考试草稿已变化或不可编辑，请刷新", 409);
  return draft;
}

export async function createPaperDraft(
  teacherId: string,
  courseId: string,
  file: File,
  context: AuditRequestContext,
) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      teacherId,
      status: { not: "ARCHIVED" },
      questionCategory: { isActive: true },
    },
    select: {
      id: true,
      questionCategoryId: true,
      currentPublishedSyllabusStructure: { select: { structureJson: true } },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  if (
    !storedPublishableSyllabusStructureSchema.safeParse(
      course.currentPublishedSyllabusStructure?.structureJson,
    ).success
  )
    throw new AssignmentOperationError("请先发布课程教学大纲，再上传试卷", 409);
  const name = path
    .basename(file.name)
    .replace(/[\x00-\x1f/\\]/gu, "_")
    .slice(0, 255);
  const format = path.extname(name).toLowerCase();
  if (![".doc", ".docx", ".pdf", ".txt", ".json"].includes(format))
    throw new AssignmentOperationError(
      "仅支持 DOC、DOCX、PDF、TXT、JSON 试卷",
      400,
    );
  if (file.size === 0 || file.size > 20 * 1024 * 1024)
    throw new AssignmentOperationError(
      "试卷文件必须大于 0 且不能超过 20 MB",
      400,
    );
  const bytes = Buffer.from(await file.arrayBuffer());
  const magic =
    format === ".pdf"
      ? bytes.subarray(0, 5).toString() === "%PDF-"
      : format === ".docx"
        ? bytes[0] === 0x50 && bytes[1] === 0x4b
        : format === ".doc"
          ? bytes
              .subarray(0, 8)
              .equals(
                Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
              )
          : !bytes.includes(0);
  if (!magic) throw new AssignmentOperationError("文件内容与格式不匹配", 400);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `exam-papers/${randomUUID()}/source`;
  await getStorageService().save(storageKey, bytes);
  try {
    return await prisma.$transaction(async (tx) => {
      const draft = await tx.examPaperDraft.create({
        data: {
          teacherId,
          courseId,
          questionCategoryId: course.questionCategoryId,
          sourceFileName: name,
          sourceFormat: format.slice(1).toUpperCase(),
          sourceChecksum: checksum,
          sourceStorageKey: storageKey,
          promptVersion: EXAM_PAPER_PROMPT_VERSION,
        },
      });
      const job = await createBackgroundJob(
        {
          type: EXAM_PAPER_JOB_TYPE,
          requestedById: teacherId,
          courseId,
          idempotencyKey: `${draft.id}:1`,
          input: { draftId: draft.id, revision: 1 },
          maxAttempts: 3,
        },
        tx,
      );
      await tx.examPaperDraft.update({
        where: { id: draft.id },
        data: { jobId: job.id },
      });
      await writeTeachingAuditLog(tx, {
        actorId: teacherId,
        action: AuditAction.EXAM_DRAFT_CREATED,
        targetType: AuditTargetType.EXAM_DRAFT,
        targetId: draft.id,
        summary: "上传试卷并创建 AI 解析草稿",
        beforeData: null,
        afterData: { courseId, sourceFileName: name, sourceChecksum: checksum },
        context,
      });
      return { id: draft.id, status: draft.status, jobId: job.id };
    });
  } catch (error) {
    await getStorageService().delete(storageKey);
    throw error;
  }
}

export async function listPaperDrafts(
  teacherId: string,
  scope?: { courseId?: string; classroomId?: string },
) {
  return prisma.examPaperDraft.findMany({
    where: {
      teacherId,
      ...(scope && {
        publishedExamId: null,
        ...(scope.courseId && { courseId: scope.courseId }),
        ...(scope.classroomId && { classroomIds: { has: scope.classroomId } }),
      }),
    },
    select: {
      id: true,
      courseId: true,
      title: true,
      status: true,
      sourceFileName: true,
      errorCode: true,
      createdAt: true,
      updatedAt: true,
      publishedExamId: true,
      _count: { select: { questions: true } },
      job: { select: { status: true, progress: true, errorCode: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
}

export async function getPaperDraft(teacherId: string, draftId: string) {
  await ownedPaperDraft(teacherId, draftId);
  const draft = await prisma.examPaperDraft.findUniqueOrThrow({
    where: { id: draftId },
    select: {
      id: true,
      courseId: true,
      questionCategoryId: true,
      sourceFileName: true,
      sourceFormat: true,
      sourceText: true,
      sourceChecksum: true,
      status: true,
      errorCode: true,
      revision: true,
      type: true,
      title: true,
      startsAt: true,
      endsAt: true,
      allowedSwitches: true,
      classroomIds: true,
      publishedExamId: true,
      provider: true,
      model: true,
      createdAt: true,
      updatedAt: true,
      job: {
        select: {
          status: true,
          progress: true,
          errorCode: true,
          attemptCount: true,
        },
      },
      questions: {
        orderBy: { ordinal: "asc" },
        select: {
          id: true,
          ordinal: true,
          sourceLocator: true,
          questionJson: true,
          points: true,
          pointsInferred: true,
          answerSource: true,
          confidence: true,
          revision: true,
          reviewedRevision: true,
          issues: true,
          assets: {
            where: { kind: "QUESTION_CROP", isActive: true },
            select: {
              id: true,
              kind: true,
              width: true,
              height: true,
              checksum: true,
            },
          },
        },
      },
      assets: {
        where: { kind: "SOURCE_IMAGE" },
        select: {
          id: true,
          kind: true,
          pageNumber: true,
          width: true,
          height: true,
        },
        orderBy: { pageNumber: "asc" },
      },
    },
  });
  const course = await prisma.course.findUnique({
    where: { id: draft.courseId },
    select: {
      currentPublishedSyllabusStructure: { select: { structureJson: true } },
    },
  });
  const syllabus = storedPublishableSyllabusStructureSchema.safeParse(
    course?.currentPublishedSyllabusStructure?.structureJson,
  );
  return {
    ...draft,
    objectives: syllabus.success
      ? syllabus.data.objectives.map(({ code, title, description }) => ({
          code,
          title,
          description,
        }))
      : [],
    questions: draft.questions.map((question) => ({
      ...question,
      points: question.points.toNumber(),
    })),
  };
}

async function editable(teacherId: string, draftId: string) {
  const draft = await ownedPaperDraft(teacherId, draftId);
  if (draft.status !== "READY")
    throw new AssignmentOperationError("考试草稿尚未完成解析或已发布", 409);
  return draft;
}

export async function updatePaperDraftConfig(
  teacherId: string,
  draftId: string,
  raw: unknown,
  context: AuditRequestContext = { ipAddress: null, userAgent: null },
) {
  const input = paperDraftConfigSchema.parse(raw);
  await editable(teacherId, draftId);
  return prisma.$transaction(async (tx) => {
    await lockEditableDraft(tx, teacherId, draftId);
    const updated = await tx.examPaperDraft.updateMany({
      where: {
        id: draftId,
        teacherId,
        revision: input.expectedRevision,
        status: "READY",
      },
      data: {
        type: input.type,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        allowedSwitches: input.allowedSwitches,
        classroomIds: input.classroomIds,
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new AssignmentOperationError("草稿已变化，请刷新", 409);
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.EXAM_DRAFT_UPDATED,
      targetType: AuditTargetType.EXAM_DRAFT,
      targetId: draftId,
      summary: "修改考试草稿设置",
      beforeData: { revision: input.expectedRevision },
      afterData: {
        revision: input.expectedRevision + 1,
        title: input.title,
        type: input.type,
      },
      context,
    });
    return { revision: input.expectedRevision + 1 };
  });
}

export async function updatePaperDraftQuestion(
  teacherId: string,
  draftId: string,
  questionId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const input = paperDraftQuestionEditSchema.parse(raw);
  await editable(teacherId, draftId);
  return prisma.$transaction(async (tx) => {
    await lockEditableDraft(tx, teacherId, draftId);
    const updated = await tx.examPaperDraftQuestion.updateMany({
      where: { id: questionId, draftId, revision: input.expectedRevision },
      data: {
        questionJson: input.question as Prisma.InputJsonObject,
        points: input.points,
        pointsInferred: false,
        answerSource: "TEACHER",
        reviewedRevision: null,
        issues: [],
        revision: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new AssignmentOperationError("题目已变化，请刷新", 409);
    await tx.examPaperDraft.update({
      where: { id: draftId },
      data: { revision: { increment: 1 } },
    });
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.EXAM_DRAFT_UPDATED,
      targetType: AuditTargetType.EXAM_DRAFT,
      targetId: draftId,
      summary: "修改考试草稿题目",
      beforeData: { questionId, revision: input.expectedRevision },
      afterData: { questionId, revision: input.expectedRevision + 1 },
      context,
    });
    return { revision: input.expectedRevision + 1 };
  });
}

export async function reviewPaperDraftQuestion(
  teacherId: string,
  draftId: string,
  questionId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const input = paperDraftReviewSchema.parse(raw);
  await editable(teacherId, draftId);
  return prisma.$transaction(async (tx) => {
    const draft = await lockEditableDraft(tx, teacherId, draftId);
    const row = await tx.examPaperDraftQuestion.findFirst({
      where: { id: questionId, draftId },
      include: { assets: { where: { kind: "QUESTION_CROP", isActive: true } } },
    });
    if (!row) throw new ResourceNotFoundError("题目不存在");
    const objectiveCodes = await currentObjectiveCodes(tx, draft.courseId);
    await validatePaperDraftQuestion(
      row,
      draft.questionCategoryId,
      objectiveCodes,
    );
    const updated = await tx.examPaperDraftQuestion.updateMany({
      where: { id: questionId, draftId, revision: input.expectedRevision },
      data: { reviewedRevision: input.expectedRevision, issues: [] },
    });
    if (updated.count !== 1)
      throw new AssignmentOperationError("题目已变化，请刷新", 409);
    await tx.examPaperDraft.update({
      where: { id: draftId },
      data: { revision: { increment: 1 } },
    });
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.EXAM_DRAFT_REVIEWED,
      targetType: AuditTargetType.EXAM_DRAFT,
      targetId: draftId,
      summary: "确认考试草稿题目",
      beforeData: { questionId },
      afterData: { questionId, revision: input.expectedRevision },
      context,
    });
    return { reviewedRevision: input.expectedRevision };
  });
}

type ReviewRow = Prisma.ExamPaperDraftQuestionGetPayload<{
  include: { assets: true };
}>;

async function validatePaperDraftQuestion(
  row: ReviewRow,
  questionCategoryId: string,
  codes: Set<string>,
) {
  const question = paperDraftQuestionSchema.parse(row.questionJson);
  if (!question.answer)
    throw new AssignmentOperationError("请核对并补齐标准答案", 400);
  if (question.type === "PYTHON_PROGRAMMING" && !question.programmingConfig)
    throw new AssignmentOperationError(
      "编程题需要完整判题配置，或改为简答题",
      400,
    );
  const valid = questionUpsertSchema.safeParse({
    ...question,
    questionCategoryId,
    knowledgePointIds: [],
    tags: question.tags.length ? question.tags : ["试卷导入"],
  });
  if (!valid.success)
    throw new AssignmentOperationError(
      valid.error.issues[0]?.message ?? "题目内容无效",
      400,
    );
  if (row.pointsInferred)
    throw new AssignmentOperationError("请先确认分值", 400);
  if (
    row.issues &&
    Array.isArray(row.issues) &&
    row.issues.some((issue) => String(issue).includes("图片待裁切")) &&
    !row.assets.length
  )
    throw new AssignmentOperationError("请裁切并确认题目图片", 400);
  if (question.objectiveCodes.some((code) => !codes.has(code)))
    throw new AssignmentOperationError("课程目标不属于当前正式教学大纲", 400);
  if (!question.objectiveCodes.length)
    throw new AssignmentOperationError("请确认课程目标", 400);
  if (question.objectiveCodes.length !== 1)
    throw new AssignmentOperationError("每题只能选择一个主课程目标", 400);
}

async function currentObjectiveCodes(
  tx: Prisma.TransactionClient,
  courseId: string,
) {
  const course = await tx.course.findUnique({
    where: { id: courseId },
    select: {
      currentPublishedSyllabusStructure: { select: { structureJson: true } },
    },
  });
  const syllabus = storedPublishableSyllabusStructureSchema.safeParse(
    course?.currentPublishedSyllabusStructure?.structureJson,
  );
  const codes = new Set(
    syllabus.success
      ? syllabus.data.objectives.map((objective) => objective.code)
      : [],
  );
  return codes;
}

export async function reviewAllPaperDraftQuestions(
  teacherId: string,
  draftId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const input = paperDraftReviewSchema.parse(raw);
  await editable(teacherId, draftId);
  return prisma.$transaction(
    async (tx) => {
      const draft = await lockEditableDraft(tx, teacherId, draftId);
      if (draft.revision !== input.expectedRevision)
        throw new AssignmentOperationError("草稿已变化，请刷新", 409);
      const rows = await tx.examPaperDraftQuestion.findMany({
        where: { draftId },
        include: {
          assets: { where: { kind: "QUESTION_CROP", isActive: true } },
        },
        orderBy: { ordinal: "asc" },
      });
      if (!rows.length)
        throw new AssignmentOperationError("草稿中没有题目", 400);
      const pending = rows.filter(
        (row) => row.reviewedRevision !== row.revision,
      );
      const objectiveCodes = await currentObjectiveCodes(tx, draft.courseId);
      for (const row of pending) {
        try {
          await validatePaperDraftQuestion(
            row,
            draft.questionCategoryId,
            objectiveCodes,
          );
        } catch (error) {
          if (error instanceof AssignmentOperationError)
            throw new AssignmentOperationError(
              `第 ${row.ordinal} 题：${error.message}`,
              error.status,
            );
          throw error;
        }
      }
      for (const row of pending)
        await tx.examPaperDraftQuestion.update({
          where: { id: row.id },
          data: { reviewedRevision: row.revision, issues: [] },
        });
      if (pending.length) {
        await tx.examPaperDraft.update({
          where: { id: draftId },
          data: { revision: { increment: 1 } },
        });
        await writeTeachingAuditLog(tx, {
          actorId: teacherId,
          action: AuditAction.EXAM_DRAFT_REVIEWED,
          targetType: AuditTargetType.EXAM_DRAFT,
          targetId: draftId,
          summary: "批量确认考试草稿题目",
          beforeData: { revision: input.expectedRevision },
          afterData: { questionIds: pending.map((row) => row.id) },
          context,
        });
      }
      return { reviewedCount: pending.length };
    },
    { timeout: 30_000 },
  );
}

export async function reorderPaperDraftQuestions(
  teacherId: string,
  draftId: string,
  raw: unknown,
  context: AuditRequestContext = { ipAddress: null, userAgent: null },
) {
  const input = paperDraftOrderSchema.parse(raw);
  await editable(teacherId, draftId);
  return prisma.$transaction(async (tx) => {
    const draft = await lockEditableDraft(tx, teacherId, draftId);
    if (draft.revision !== input.expectedRevision)
      throw new AssignmentOperationError("草稿已变化，请刷新", 409);
    const rows = await tx.examPaperDraftQuestion.findMany({
      where: { draftId },
      select: { id: true },
    });
    if (
      rows.length !== input.questionIds.length ||
      new Set(input.questionIds).size !== rows.length ||
      rows.some((row) => !input.questionIds.includes(row.id))
    )
      throw new AssignmentOperationError("题序列表不完整", 400);
    for (const [index, id] of input.questionIds.entries())
      await tx.examPaperDraftQuestion.update({
        where: { id },
        data: { ordinal: -(index + 1) },
      });
    for (const [index, id] of input.questionIds.entries())
      await tx.examPaperDraftQuestion.update({
        where: { id },
        data: { ordinal: index + 1 },
      });
    await tx.examPaperDraft.update({
      where: { id: draftId },
      data: { revision: { increment: 1 } },
    });
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.EXAM_DRAFT_UPDATED,
      targetType: AuditTargetType.EXAM_DRAFT,
      targetId: draftId,
      summary: "调整考试草稿题序",
      beforeData: { revision: input.expectedRevision },
      afterData: { questionIds: input.questionIds },
      context,
    });
    return { revision: input.expectedRevision + 1 };
  });
}

export async function removePaperDraftQuestion(
  teacherId: string,
  draftId: string,
  questionId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const input = paperDraftReviewSchema.parse(raw);
  await editable(teacherId, draftId);
  return prisma.$transaction(async (tx) => {
    await lockEditableDraft(tx, teacherId, draftId);
    const row = await tx.examPaperDraftQuestion.findFirst({
      where: { id: questionId, draftId, revision: input.expectedRevision },
      select: { id: true, ordinal: true },
    });
    if (!row) throw new AssignmentOperationError("题目已变化，请刷新", 409);
    await tx.examPaperAsset.updateMany({
      where: { draftQuestionId: questionId, kind: "QUESTION_CROP" },
      data: { isActive: false },
    });
    await tx.examPaperDraftQuestion.delete({ where: { id: questionId } });
    await tx.examPaperDraft.update({
      where: { id: draftId },
      data: { revision: { increment: 1 } },
    });
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.EXAM_DRAFT_UPDATED,
      targetType: AuditTargetType.EXAM_DRAFT,
      targetId: draftId,
      summary: "移除考试草稿题目",
      beforeData: { questionId, ordinal: row.ordinal },
      afterData: null,
      context,
    });
    return { removed: true };
  });
}

export async function cropPaperDraftImage(
  teacherId: string,
  draftId: string,
  questionId: string,
  raw: unknown,
  context: AuditRequestContext = { ipAddress: null, userAgent: null },
) {
  const input = paperDraftCropSchema.parse(raw);
  await editable(teacherId, draftId);
  const source = await prisma.examPaperAsset.findFirst({
    where: { id: input.sourceAssetId, draftId, kind: "SOURCE_IMAGE" },
  });
  const question = await prisma.examPaperDraftQuestion.findFirst({
    where: { id: questionId, draftId },
  });
  if (!source || !question) throw new ResourceNotFoundError("题目图片不存在");
  const left = Math.floor(input.x * source.width);
  const top = Math.floor(input.y * source.height);
  const width = Math.min(
    source.width - left,
    Math.floor(input.width * source.width),
  );
  const height = Math.min(
    source.height - top,
    Math.floor(input.height * source.height),
  );
  if (width < 20 || height < 20)
    throw new AssignmentOperationError("图片区域过小", 400);
  const bytes = await sharp(await getStorageService().read(source.storageKey))
    .extract({ left, top, width, height })
    .jpeg({ quality: 88 })
    .toBuffer();
  const storageKey = `exam-papers/${draftId}/crops/${randomUUID()}`;
  await getStorageService().save(storageKey, bytes);
  try {
    return await prisma.$transaction(async (tx) => {
      await lockEditableDraft(tx, teacherId, draftId);
      const updated = await tx.examPaperDraftQuestion.updateMany({
        where: { id: questionId, draftId, revision: input.expectedRevision },
        data: { revision: { increment: 1 }, reviewedRevision: null },
      });
      if (updated.count !== 1)
        throw new AssignmentOperationError("题目已变化，请刷新", 409);
      await tx.examPaperAsset.updateMany({
        where: {
          draftQuestionId: questionId,
          kind: "QUESTION_CROP",
          isActive: true,
        },
        data: { isActive: false },
      });
      const asset = await tx.examPaperAsset.create({
        data: {
          draftId,
          draftQuestionId: questionId,
          kind: "QUESTION_CROP",
          storageKey,
          checksum: createHash("sha256").update(bytes).digest("hex"),
          mimeType: "image/jpeg",
          width,
          height,
          pageNumber: source.pageNumber,
        },
      });
      await tx.examPaperDraft.update({
        where: { id: draftId },
        data: { revision: { increment: 1 } },
      });
      await writeTeachingAuditLog(tx, {
        actorId: teacherId,
        action: AuditAction.EXAM_DRAFT_UPDATED,
        targetType: AuditTargetType.EXAM_DRAFT,
        targetId: draftId,
        summary: "确认考试草稿题目图片区域",
        beforeData: { questionId },
        afterData: { questionId, assetId: asset.id, checksum: asset.checksum },
        context,
      });
      return { id: asset.id, revision: input.expectedRevision + 1 };
    });
  } catch (error) {
    await getStorageService().delete(storageKey);
    throw error;
  }
}

export async function readPaperDraftAsset(
  teacherId: string,
  draftId: string,
  assetId: string,
) {
  await ownedPaperDraft(teacherId, draftId);
  const asset = await prisma.examPaperAsset.findFirst({
    where: { id: assetId, draftId },
  });
  if (!asset) throw new ResourceNotFoundError("图片不存在");
  return {
    mimeType: asset.mimeType,
    bytes: await getStorageService().read(asset.storageKey),
  };
}

export async function readPaperDraftSource(teacherId: string, draftId: string) {
  const draft = await ownedPaperDraft(teacherId, draftId);
  return {
    fileName: draft.sourceFileName,
    mimeType:
      (
        {
          DOC: "application/msword",
          DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          PDF: "application/pdf",
          TXT: "text/plain",
          JSON: "application/json",
        } as Record<string, string>
      )[draft.sourceFormat] ?? "application/octet-stream",
    bytes: await getStorageService().read(draft.sourceStorageKey),
  };
}

export async function retryPaperDraft(
  teacherId: string,
  draftId: string,
  context: AuditRequestContext = { ipAddress: null, userAgent: null },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ExamPaperDraft" WHERE id = ${draftId} FOR UPDATE`;
    const draft = await tx.examPaperDraft.findFirst({
      where: { id: draftId, teacherId, status: "FAILED" },
    });
    if (!draft) throw new AssignmentOperationError("草稿不可重试", 409);
    const revision = draft.revision + 1;
    const job = await createBackgroundJob(
      {
        type: EXAM_PAPER_JOB_TYPE,
        requestedById: teacherId,
        courseId: draft.courseId,
        idempotencyKey: `${draft.id}:${revision}`,
        input: { draftId: draft.id, revision },
        maxAttempts: 3,
      },
      tx,
    );
    await tx.examPaperDraft.update({
      where: { id: draft.id },
      data: {
        status: "PENDING",
        errorCode: null,
        revision,
        jobId: job.id,
      },
    });
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.EXAM_DRAFT_UPDATED,
      targetType: AuditTargetType.EXAM_DRAFT,
      targetId: draftId,
      summary: "重试考试试卷解析",
      beforeData: { revision: draft.revision, errorCode: draft.errorCode },
      afterData: { revision, jobId: job.id },
      context,
    });
    return { id: draft.id, status: "PENDING", jobId: job.id };
  });
}
