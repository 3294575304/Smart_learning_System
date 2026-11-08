import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import sharp from "sharp";

import { prisma } from "@/lib/prisma";
import { createAIProvider } from "@/services/ai/provider-factory";
import { scrubSensitiveText } from "@/services/ai/privacy";
import {
  completeBackgroundJob,
  failBackgroundJob,
  heartbeatBackgroundJob,
} from "@/services/background-jobs/repository";
import { getStorageService } from "@/services/storage";
import { storedPublishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";
import { examPaperAIOutputSchema, type ExamPaperAIQuestion } from "./paper-ai";
import { extractExamPaperSource, type PaperSourceImage } from "./paper-source";

type SourceImage = {
  id: string;
  bytes: Buffer;
  width: number;
  height: number;
  pageNumber: number | null;
};

function errorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  )
    return error.code.slice(0, 100);
  if (error instanceof Error && /试卷|PDF|DOCX|文件/u.test(error.message))
    return "SOURCE_PARSE_FAILED";
  return "AI_PAPER_PARSE_FAILED";
}

function cleanQuestion(item: ExamPaperAIQuestion) {
  const trailing = /\s*[（(]\s*\d+(?:\.\d+)?\s*分\s*[）)]\s*$/u;
  return {
    title: item.title || item.content.slice(0, 40) || "待核对题目",
    content: item.content.replace(trailing, "").trim(),
    type: item.type,
    objectiveCodes: item.objectiveCodes,
    options: item.options,
    answer: item.answer,
    explanation: item.explanation,
    tags: item.tags.map((tag) => tag.trim()).filter(Boolean).length
      ? item.tags.map((tag) => tag.trim()).filter(Boolean)
      : ["试卷导入"],
    programmingConfig: null,
  };
}

async function saveSourceImage(
  draftId: string,
  image: PaperSourceImage,
): Promise<SourceImage> {
  const checksum = createHash("sha256").update(image.bytes).digest("hex");
  const storageKey = `exam-papers/${draftId}/source-images/${checksum}`;
  await getStorageService().save(storageKey, image.bytes);
  const asset = await prisma.examPaperAsset.upsert({
    where: { storageKey },
    create: {
      draftId,
      kind: "SOURCE_IMAGE",
      storageKey,
      checksum,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      pageNumber: image.pageNumber,
    },
    update: {},
  });
  return {
    id: asset.id,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    pageNumber: image.pageNumber,
  };
}

async function saveCrop(
  draftId: string,
  ordinal: number,
  regionIndex: number,
  source: SourceImage,
  region: ExamPaperAIQuestion["imageRegions"][number],
) {
  if (region.x + region.width > 1 || region.y + region.height > 1)
    throw new Error("IMAGE_REGION_INVALID");
  const left = Math.floor(region.x * source.width);
  const top = Math.floor(region.y * source.height);
  const width = Math.min(
    source.width - left,
    Math.floor(region.width * source.width),
  );
  const height = Math.min(
    source.height - top,
    Math.floor(region.height * source.height),
  );
  if (width < 20 || height < 20) throw new Error("IMAGE_REGION_INVALID");
  const bytes = await sharp(source.bytes)
    .extract({ left, top, width, height })
    .jpeg({ quality: 88 })
    .toBuffer();
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `exam-papers/${draftId}/suggested-crops/${ordinal}-${regionIndex}-${checksum}`;
  await getStorageService().save(storageKey, bytes);
  return {
    storageKey,
    checksum,
    mimeType: "image/jpeg",
    width,
    height,
    pageNumber: source.pageNumber,
  };
}

export async function executeClaimedExamPaperJob(
  jobId: string,
  leaseId: string,
  input: { draftId: string; revision: number },
) {
  const draft = await prisma.examPaperDraft.findFirst({
    where: {
      id: input.draftId,
      jobId,
      revision: input.revision,
      status: "PENDING",
    },
  });
  if (!draft) {
    await failBackgroundJob(jobId, {
      leaseId,
      errorCode: "EXAM_DRAFT_STATE_CHANGED",
      retryable: false,
      resourceUsage: {},
    });
    return;
  }
  try {
    const provider = createAIProvider();
    const course = await prisma.course.findUnique({
      where: { id: draft.courseId },
      select: {
        currentPublishedSyllabusStructure: { select: { structureJson: true } },
      },
    });
    const syllabus = storedPublishableSyllabusStructureSchema.safeParse(
      course?.currentPublishedSyllabusStructure?.structureJson,
    );
    const objectives = syllabus.success
      ? syllabus.data.objectives.map(({ code, title, description }) => ({
          code,
          title,
          description: description.slice(0, 1_200),
        }))
      : [];
    const objectiveCodes = new Set(
      objectives.map((objective) => objective.code),
    );
    if (!provider.parseExamPaper)
      throw Object.assign(new Error("AI 视觉解析不可用"), {
        code: "AI_PAPER_UNSUPPORTED",
      });
    const bytes = await getStorageService().read(draft.sourceStorageKey);
    if (
      createHash("sha256").update(bytes).digest("hex") !== draft.sourceChecksum
    )
      throw Object.assign(new Error("试卷文件校验失败"), {
        code: "SOURCE_CHECKSUM_MISMATCH",
      });
    const source = await extractExamPaperSource(
      bytes,
      draft.sourceFileName,
    ).catch(() => {
      throw Object.assign(new Error("试卷内容无法解析"), {
        code: "SOURCE_PARSE_FAILED",
      });
    });
    if (!source.chunks.length) throw new Error("试卷没有可识别内容");
    const parsed: Array<{
      item: ExamPaperAIQuestion;
      sourceImages: Map<string, SourceImage>;
    }> = [];
    for (const [chunkIndex, chunk] of source.chunks.entries()) {
      const images = new Map<string, SourceImage>();
      for (const image of chunk.images) {
        const saved = await saveSourceImage(draft.id, image);
        images.set(saved.id, saved);
      }
      let questions: ExamPaperAIQuestion[] | null = null;
      let validationError: string | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const raw = await provider.parseExamPaper(
            {
              format: source.format,
              sourceName: draft.sourceFileName,
              chunkLabel: chunk.label,
              text: scrubSensitiveText(chunk.text, [], 18_000),
              images: [...images].map(([id, image]) => ({
                id,
                dataUrl: `data:image/jpeg;base64,${image.bytes.toString("base64")}`,
              })),
              objectives,
            },
            { signal: AbortSignal.timeout(90_000), validationError },
          );
          const output = examPaperAIOutputSchema.parse(raw);
          if (
            output.questions.some(
              (item) =>
                item.imageIds.some((id) => !images.has(id)) ||
                item.imageRegions.some((region) => !images.has(region.imageId)),
            )
          )
            throw new Error("AI 引用了未提供的图片");
          if (
            output.questions.some((item) =>
              item.objectiveCodes.some((code) => !objectiveCodes.has(code)),
            )
          )
            throw new Error("AI 引用了非本课程正式大纲的课程目标");
          questions = output.questions;
          break;
        } catch (error) {
          validationError =
            error instanceof Error
              ? error.message.slice(0, 300)
              : "输出结构无效";
          if (attempt === 2) throw error;
        }
      }
      for (const item of questions ?? [])
        parsed.push({ item, sourceImages: images });
      if (parsed.length > 200) throw new Error("试卷最多包含 200 道题");
      await heartbeatBackgroundJob(jobId, {
        leaseId,
        progress: Math.min(
          95,
          Math.round(((chunkIndex + 1) / source.chunks.length) * 90),
        ),
        leaseDurationMs: 180_000,
      });
    }
    if (!parsed.length) throw new Error("AI 没有识别到题目，请检查文件内容");
    const rows: Array<{
      item: ExamPaperAIQuestion;
      question: ReturnType<typeof cleanQuestion>;
      crops: Awaited<ReturnType<typeof saveCrop>>[];
      issues: string[];
    }> = [];
    for (const [index, entry] of parsed.entries()) {
      const item = entry.item;
      const question = cleanQuestion(item);
      const issues: string[] = [];
      issues.push(...item.reviewIssues);
      if (!question.content) issues.push("题干未识别");
      if (!question.answer) issues.push("答案需教师确认或补充");
      if (!question.explanation) issues.push("解析需教师补充");
      if (objectives.length && !question.objectiveCodes.length)
        issues.push("课程目标待教师确认");
      if (item.points === null) issues.push("分值未识别，暂按 10 分");
      if (item.type === "PYTHON_PROGRAMMING")
        issues.push("编程题需补齐判题配置或改为简答题");
      if (item.imageIds.length && !item.imageRegions.length)
        issues.push("图片待裁切");
      const crops: Awaited<ReturnType<typeof saveCrop>>[] = [];
      for (const [regionIndex, region] of item.imageRegions.entries()) {
        const sourceImage = entry.sourceImages.get(region.imageId);
        if (!sourceImage) throw new Error("IMAGE_REFERENCE_INVALID");
        crops.push(
          await saveCrop(
            draft.id,
            index + 1,
            regionIndex + 1,
            sourceImage,
            region,
          ),
        );
      }
      rows.push({ item, question, crops, issues });
    }
    await completeBackgroundJob(
      jobId,
      {
        leaseId,
        result: { questionCount: rows.length },
        resourceUsage: {},
      },
      async (tx) => {
        const current = await tx.examPaperDraft.findFirst({
          where: {
            id: draft.id,
            jobId,
            revision: input.revision,
            status: "PENDING",
          },
          select: { id: true },
        });
        if (!current) throw new Error("EXAM_DRAFT_STATE_CHANGED");
        await tx.examPaperAsset.deleteMany({
          where: { draftId: draft.id, kind: "QUESTION_CROP" },
        });
        await tx.examPaperDraftQuestion.deleteMany({
          where: { draftId: draft.id },
        });
        for (const [index, row] of rows.entries()) {
          const created = await tx.examPaperDraftQuestion.create({
            data: {
              draftId: draft.id,
              ordinal: index + 1,
              sourceLocator: row.item.sourceLocator || `第 ${index + 1} 题`,
              questionJson: row.question as Prisma.InputJsonObject,
              points: row.item.points ?? 10,
              pointsInferred: row.item.points === null,
              answerSource: row.item.answerSource,
              confidence: row.item.confidence,
              issues: row.issues,
            },
          });
          for (const crop of row.crops)
            await tx.examPaperAsset.create({
              data: {
                draftId: draft.id,
                draftQuestionId: created.id,
                kind: "QUESTION_CROP",
                ...crop,
              },
            });
        }
        await tx.examPaperDraft.update({
          where: { id: draft.id },
          data: {
            status: "READY",
            errorCode: null,
            sourceText: source.text.slice(0, 2_000_000),
            sourceFormat: source.format,
            provider: provider.name,
            model: provider.model,
          },
        });
      },
    );
  } catch (error: unknown) {
    const code = errorCode(error);
    console.error("exam_paper_parse_failed", { draftId: draft.id, code });
    await failBackgroundJob(
      jobId,
      {
        leaseId,
        errorCode: code,
        retryable: [
          "AI_PAPER_PARSE_FAILED",
          "PROVIDER_UNAVAILABLE",
          "PROVIDER_TIMEOUT",
          "PROVIDER_HTTP_ERROR",
          "PROVIDER_EMPTY_RESPONSE",
          "PROVIDER_SCHEMA_INVALID",
        ].includes(code),
        resourceUsage: {},
      },
      async (tx, _job, willRetry) => {
        await tx.examPaperDraft.update({
          where: { id: draft.id },
          data: {
            status: willRetry ? "PENDING" : "FAILED",
            errorCode: code,
          },
        });
      },
    );
  }
}
