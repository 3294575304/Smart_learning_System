import "server-only";

import { QuestionType, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { scrubSensitiveText } from "@/services/ai/privacy";
import { createAIProvider } from "@/services/ai/provider-factory";
import { AIProviderRequestError } from "@/services/ai/provider";
import {
  completeBackgroundJob,
  failBackgroundJob,
  heartbeatBackgroundJob,
} from "@/services/background-jobs/repository";
import {
  generatedQuestionsOutputSchema,
  questionReviewOutputSchema,
  questionGenerationRequestSchema,
  type QuestionGenerationAIInput,
} from "@/services/ai-question-generation/schemas";
import { FILE_LIFETIME_MS } from "@/services/ai-question-generation/service";
import { extractQuestionFile } from "@/services/question-import/file-extractor";
import { questionUpsertSchema } from "@/services/questions/schemas";
import { getStorageService } from "@/services/storage";
import { extractTextFromPdf } from "@/services/syllabus-parsing/pdf-extractor";

interface Evidence {
  id: string;
  locator: string;
  text: string;
}

function chunks(text: string, prefix: string, locator: string): Evidence[] {
  const paragraphs = text
    .split(/\n{2,}/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const result: Evidence[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length > 1_000 && current) {
      result.push({
        id: `${prefix}:${result.length + 1}`,
        locator: `${locator} 第 ${result.length + 1} 段`,
        text: current,
      });
      current = "";
    }
    current += `${paragraph.slice(0, 1_000)}\n`;
  }
  if (current)
    result.push({
      id: `${prefix}:${result.length + 1}`,
      locator: `${locator} 第 ${result.length + 1} 段`,
      text: current,
    });
  return result;
}

function rankEvidence(
  items: Evidence[],
  keywords: string[],
  privateNames: string[],
  priorityPrefix: string | null,
): Evidence[] {
  const terms = keywords
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
  const ranked = items
    .map((item, index) => ({
      item,
      index,
      priority: priorityPrefix && item.id.startsWith(priorityPrefix) ? 1 : 0,
      score: terms.reduce(
        (sum, term) => sum + (item.text.includes(term) ? 1 : 0),
        0,
      ),
    }))
    .sort(
      (a, b) =>
        b.priority - a.priority || b.score - a.score || a.index - b.index,
    );
  const preferred =
    priorityPrefix === "FILE:"
      ? [
          ...ranked.filter((entry) => entry.priority).slice(0, 6),
          ...ranked.filter((entry) => !entry.priority).slice(0, 2),
        ]
      : [];
  const chosen = new Set(preferred.map((entry) => entry.index));
  return [...preferred, ...ranked.filter((entry) => !chosen.has(entry.index))]
    .slice(0, 8)
    .map(({ item }) => ({
      ...item,
      locator: scrubSensitiveText(item.locator, privateNames, 120),
      text: scrubSensitiveText(
        item.text.replace(
          /(?:学生)?姓名\s*[:：]\s*[\p{Script=Han}]{2,4}/gu,
          "姓名：[已隐藏身份信息]",
        ),
        privateNames,
        1_200,
      ),
    }));
}

async function loadEvidence(batch: {
  id: string;
  courseId: string;
  graphVersionId: string | null;
  syllabusStructureId: string | null;
  sourceFileStorageKey: string | null;
  sourceFileName: string | null;
  sourceFileChecksum: string | null;
  mode: string;
  request: Prisma.JsonValue;
  questionCategoryId: string;
}) {
  const request = questionGenerationRequestSchema.parse(batch.request);
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: batch.courseId },
    select: { name: true },
  });
  const [profiles, identities] = await Promise.all([
    prisma.userProfile.findMany({
      where: {
        user: {
          classMemberships: {
            some: { classroom: { courseId: batch.courseId } },
          },
        },
      },
      select: { displayName: true },
      take: 1_000,
    }),
    prisma.studentIdentity.findMany({
      where: {
        assignments: { some: { classroom: { courseId: batch.courseId } } },
      },
      select: { name: true },
      take: 1_000,
    }),
  ]);
  const privateNames = [
    ...new Set([
      ...profiles.map((item) => item.displayName),
      ...identities.map((item) => item.name),
    ]),
  ];
  let chapterNodeIds: string[] | null = null;
  if (request.chapterCode && batch.graphVersionId) {
    const chapter = await prisma.publishedKnowledgeGraphNode.findFirst({
      where: {
        graphVersionId: batch.graphVersionId,
        nodeType: "CHAPTER",
        code: request.chapterCode,
      },
      select: {
        outgoingEdges: {
          where: { relationType: "CONTAINS" },
          select: { toNodeId: true },
        },
      },
    });
    chapterNodeIds = chapter?.outgoingEdges.map((edge) => edge.toNodeId) ?? [];
  }
  const nodes = batch.graphVersionId
    ? await prisma.publishedKnowledgeGraphNode.findMany({
        where: {
          graphVersionId: batch.graphVersionId,
          nodeType: "KNOWLEDGE_POINT",
          ...(request.conceptIds.length
            ? { conceptId: { in: request.conceptIds } }
            : {}),
          ...(chapterNodeIds ? { id: { in: chapterNodeIds } } : {}),
        },
        orderBy: { sortOrder: "asc" },
        take: 60,
        select: {
          id: true,
          conceptId: true,
          code: true,
          name: true,
          description: true,
          sourcePath: true,
        },
      })
    : [];
  const evidence: Evidence[] = nodes.map((node) => ({
    id: `GRAPH:${node.id}`,
    locator: `正式知识图谱 ${node.sourcePath ?? node.code}`,
    text: `${node.name}。${node.description ?? ""}`,
  }));
  const keywords = nodes.map((node) => node.name);
  if (batch.syllabusStructureId) {
    const syllabus = await prisma.publishedSyllabusStructure.findUnique({
      where: { id: batch.syllabusStructureId },
      select: { structureJson: true },
    });
    if (syllabus)
      evidence.push(
        ...chunks(
          JSON.stringify(syllabus.structureJson),
          `SYLLABUS:${batch.syllabusStructureId}`,
          "正式大纲",
        ),
      );
  }
  if (
    batch.mode === "FILE" &&
    batch.sourceFileStorageKey &&
    batch.sourceFileName
  ) {
    const bytes = await getStorageService().read(batch.sourceFileStorageKey);
    const file = new File([new Uint8Array(bytes)], batch.sourceFileName);
    const source = await extractQuestionFile(file);
    if (source.checksum !== batch.sourceFileChecksum)
      throw new Error("SOURCE_CHECKSUM_MISMATCH");
    if (source.format === "PDF") {
      const extracted = await extractTextFromPdf(bytes);
      for (const page of extracted.pages)
        evidence.push(
          ...chunks(
            page.text,
            `FILE:${source.checksum.slice(0, 12)}:P${page.pageNumber}`,
            `${source.fileName} 第 ${page.pageNumber} 页`,
          ),
        );
    } else {
      evidence.push(
        ...chunks(
          source.text,
          `FILE:${source.checksum.slice(0, 12)}`,
          source.fileName,
        ),
      );
    }
  }
  let sourceQuestion: { title: string; content: string } | null = null;
  if (batch.mode === "ANALOGY" && request.sourceQuestionId) {
    const question = await prisma.question.findFirst({
      where: {
        id: request.sourceQuestionId,
        questionCategoryId: batch.questionCategoryId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { title: true, content: true },
    });
    if (!question) throw new Error("SOURCE_QUESTION_UNAVAILABLE");
    sourceQuestion = {
      title: scrubSensitiveText(question.title, privateNames, 120),
      content: scrubSensitiveText(question.content, privateNames, 2_000),
    };
    evidence.unshift({
      id: `QUESTION:${request.sourceQuestionId}`,
      locator: "题库原题",
      text: `${sourceQuestion.title}。${sourceQuestion.content}`,
    });
  }
  const selected = rankEvidence(
    evidence,
    keywords,
    privateNames,
    batch.mode === "FILE"
      ? "FILE:"
      : batch.mode === "ANALOGY"
        ? "QUESTION:"
        : null,
  );
  if (!selected.length) throw new Error("COURSE_EVIDENCE_EMPTY");
  return {
    request,
    courseName: course.name,
    evidence: selected,
    concepts: nodes.flatMap((node) =>
      node.conceptId
        ? [
            {
              id: node.conceptId,
              name: scrubSensitiveText(node.name, privateNames, 120),
            },
          ]
        : [],
    ),
    sourceQuestion,
    privateNames,
  };
}

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function similarity(left: string, right: string) {
  if (left.length < 6 || right.length < 6) return 0;
  const grams = (value: string) =>
    new Set(
      Array.from({ length: value.length - 2 }, (_, index) =>
        value.slice(index, index + 3),
      ),
    );
  const a = grams(left);
  const b = grams(right);
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / Math.max(1, a.size + b.size - shared);
}

function generationFailureCode(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return issue
      ? `SCHEMA:${issue.path.join(".")}:${issue.message}`
      : "SCHEMA:UNKNOWN";
  }
  if (error instanceof AIProviderRequestError) return `PROVIDER:${error.code}`;
  if (!(error instanceof Error)) return "UNKNOWN_OUTPUT";
  if (error.message.startsWith("题目审查未通过")) return "REVIEW_REJECTED";
  const known = [
    "题目数量与请求不一致",
    "题型或难度与请求不一致",
    "选项数量与请求不一致",
    "编程判题配置缺失或多余",
    "编程题测试用例超过 10 个",
    "引用了不存在的证据",
    "生成题与现有题重复",
    "题干包含来源提示",
    "主知识点不在正式图谱范围内",
  ];
  return known.includes(error.message) ? error.message : "INVALID_MODEL_OUTPUT";
}

export async function executeClaimedAIQuestionGenerationJob(
  jobId: string,
  leaseId: string,
  batchId: string,
  generationRevision: number,
) {
  const batch = await prisma.aIQuestionGenerationBatch.findUnique({
    where: { id: batchId },
    include: { candidates: { select: { ordinal: true, questionJson: true } } },
  });
  if (
    !batch ||
    batch.jobId !== jobId ||
    batch.generationRevision !== generationRevision
  )
    throw new Error("AI_QUESTION_BATCH_STALE");
  await prisma.aIQuestionGenerationBatch.update({
    where: { id: batchId },
    data: { status: "RUNNING" },
  });
  let provider;
  try {
    provider = createAIProvider();
  } catch {
    await failBackgroundJob(
      jobId,
      {
        leaseId,
        errorCode: "AI_PROVIDER_NOT_CONFIGURED",
        retryable: false,
        resourceUsage: {},
      },
      async (tx) => {
        await tx.aIQuestionGenerationBatch.update({
          where: { id: batchId },
          data: {
            status: "FAILED",
            errorCode: "AI_PROVIDER_NOT_CONFIGURED",
            sourceFileExpiresAt: batch.sourceFileStorageKey
              ? new Date(Date.now() + FILE_LIFETIME_MS)
              : null,
          },
        });
      },
    );
    return;
  }
  if (!provider.generateQuestions || !provider.reviewGeneratedQuestions) {
    await failBackgroundJob(
      jobId,
      {
        leaseId,
        errorCode: "AI_GENERATION_UNSUPPORTED",
        retryable: false,
        resourceUsage: {},
      },
      async (tx) => {
        await tx.aIQuestionGenerationBatch.update({
          where: { id: batchId },
          data: {
            status: "FAILED",
            errorCode: "AI_GENERATION_UNSUPPORTED",
            sourceFileExpiresAt: batch.sourceFileStorageKey
              ? new Date(Date.now() + FILE_LIFETIME_MS)
              : null,
          },
        });
      },
    );
    return;
  }
  try {
    const source = await loadEvidence(batch);
    const types = Object.values(QuestionType).filter(
      (type) => (source.request.counts[type] ?? 0) > 0,
    );
    const existing = new Map(
      batch.candidates.map((item) => [item.ordinal, item]),
    );
    const seen = new Set(
      batch.candidates.map((item) =>
        normalized(questionUpsertSchema.parse(item.questionJson).content),
      ),
    );
    const categoryQuestions = await prisma.question.findMany({
      where: {
        questionCategoryId: batch.questionCategoryId,
        deletedAt: null,
        status: "ACTIVE",
      },
      select: { content: true },
      take: 2_000,
    });
    const bank = new Set(
      categoryQuestions.map((item) => normalized(item.content)),
    );
    const saved: Array<{
      ordinal: number;
      question: Prisma.InputJsonObject;
      programmingConfig: Prisma.InputJsonObject | null;
      sourceRefs: Prisma.InputJsonObject[];
      qualityFlags: string[];
      primaryConceptId: string | null;
    }> = [];
    let failed = 0;
    const failureDetails: Array<{
      ordinal: number;
      type: QuestionType;
      code: string;
    }> = [];
    let offset = 0;
    for (const type of types) {
      const count = source.request.counts[type] ?? 0;
      const missing = Array.from(
        { length: count },
        (_, index) => offset + index + 1,
      ).filter((ordinal) => !existing.has(ordinal));
      offset += count;
      if (!missing.length) continue;
      for (const ordinal of missing) {
        let validationError: string | undefined;
        let failureCode = "INVALID_MODEL_OUTPUT";
        let generated: Array<{
          ordinal: number;
          question: Prisma.InputJsonObject;
          programmingConfig: Prisma.InputJsonObject | null;
          sourceRefs: Prisma.InputJsonObject[];
          qualityFlags: string[];
          primaryConceptId: string | null;
        }> = [];
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await heartbeatBackgroundJob(jobId, {
              leaseId,
              progress: Math.max(
                1,
                Math.floor(
                  ((saved.length + batch.candidates.length + failed) /
                    batch.requestedCount) *
                    90,
                ),
              ),
              leaseDurationMs: 180_000,
            });
            const aiInput: QuestionGenerationAIInput = {
              mode: source.request.mode,
              courseName: source.courseName,
              type,
              count: 1,
              sequence: ordinal,
              difficulty: source.request.difficulty,
              bloomLevel: source.request.bloomLevel,
              optionCount:
                type === QuestionType.SINGLE_CHOICE
                  ? source.request.singleChoiceOptions
                  : type === QuestionType.MULTIPLE_CHOICE
                    ? source.request.multipleChoiceOptions
                    : null,
              evidence: source.evidence,
              sourceQuestion: source.sourceQuestion,
              concepts: source.concepts,
            };
            const raw = await provider.generateQuestions(aiInput, {
              signal: AbortSignal.timeout(60_000),
              validationError,
            });
            const parsed = generatedQuestionsOutputSchema.parse(raw);
            if (parsed.questions.length !== 1)
              throw new Error("题目数量与请求不一致");
            const local: typeof generated = [];
            for (const item of parsed.questions) {
              if (
                item.question.type !== type ||
                item.question.difficulty !== source.request.difficulty
              )
                throw new Error("题型或难度与请求不一致");
              if (
                (type === QuestionType.SINGLE_CHOICE ||
                  type === QuestionType.MULTIPLE_CHOICE) &&
                item.question.options.length !== aiInput.optionCount
              )
                throw new Error("选项数量与请求不一致");
              if (
                (type === QuestionType.PYTHON_PROGRAMMING) !==
                Boolean(item.programmingConfig)
              )
                throw new Error("编程判题配置缺失或多余");
              if (
                item.programmingConfig &&
                item.programmingConfig.testCases.length > 10
              )
                throw new Error("编程题测试用例超过 10 个");
              const refs = item.sourceIds.map((id) =>
                source.evidence.find((ref) => ref.id === id),
              );
              if (refs.some((ref) => !ref))
                throw new Error("引用了不存在的证据");
              if (
                /根据(?:课程大纲|课程证据|材料)/u.test(
                  `${item.question.title} ${item.question.content}`,
                )
              )
                throw new Error("题干包含来源提示");
              if (
                source.concepts.length > 0 &&
                !source.concepts.some(
                  (concept) => concept.id === item.primaryConceptId,
                )
              )
                throw new Error("主知识点不在正式图谱范围内");
              if (
                source.concepts.length === 0 &&
                item.primaryConceptId !== null
              )
                throw new Error("主知识点不在正式图谱范围内");
              const question = questionUpsertSchema.parse({
                ...item.question,
                questionCategoryId: batch.questionCategoryId,
                knowledgePointIds: [],
                tags: item.question.tags.length
                  ? item.question.tags
                  : ["AI 辅助出题"],
              });
              const key = normalized(question.content);
              if (
                seen.has(key) ||
                bank.has(key) ||
                local.some(
                  (entry) => normalized(String(entry.question.content)) === key,
                )
              )
                throw new Error("生成题与现有题重复");
              const qualityFlags = ["请核对事实、答案和引用依据后再确认入库"];
              if ([...bank].some((prior) => similarity(prior, key) >= 0.8))
                qualityFlags.push("与题库现有题目较相似，请核查是否需要保留");
              local.push({
                ordinal,
                question: question as unknown as Prisma.InputJsonObject,
                programmingConfig:
                  item.programmingConfig as unknown as Prisma.InputJsonObject | null,
                sourceRefs: refs.filter((ref): ref is Evidence =>
                  Boolean(ref),
                ) as unknown as Prisma.InputJsonObject[],
                qualityFlags,
                primaryConceptId: item.primaryConceptId,
              });
            }
            const review = questionReviewOutputSchema.parse(
              await provider.reviewGeneratedQuestions(
                {
                  type,
                  difficulty: source.request.difficulty,
                  evidence: source.evidence,
                  draftText: scrubSensitiveText(
                    JSON.stringify(parsed.questions),
                    source.privateNames,
                    12_000,
                  ),
                  count: parsed.questions.length,
                },
                { signal: AbortSignal.timeout(60_000) },
              ),
            );
            if (
              review.reviews.length !== local.length ||
              review.reviews.some(
                (item, index) =>
                  item.index !== index ||
                  !item.factsSupported ||
                  !item.answerConsistent ||
                  !item.clear ||
                  !item.difficultyAligned,
              )
            )
              throw new Error(
                `题目审查未通过：${review.reviews.find((item) => !item.factsSupported || !item.answerConsistent || !item.clear || !item.difficultyAligned)?.reason ?? "审查结果数量或顺序错误"}`,
              );
            for (const [index, item] of local.entries()) {
              const reason = review.reviews[index]?.reason.trim();
              if (reason) item.qualityFlags.push(`AI 复核：${reason}`);
            }
            generated = local;
            break;
          } catch (error) {
            console.warn("[ai-question-generation-attempt-failed]", {
              batchId,
              type,
              attempt: attempt + 1,
              code: generationFailureCode(error),
            });
            failureCode = generationFailureCode(error);
            validationError =
              error instanceof z.ZodError
                ? error.issues
                    .slice(0, 3)
                    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                    .join("；")
                    .slice(0, 300)
                : error instanceof Error
                  ? error.message.slice(0, 300)
                  : "输出格式无效";
            if (
              error instanceof AIProviderRequestError &&
              error.code === "PROVIDER_NOT_CONFIGURED"
            )
              break;
          }
        }
        if (generated.length) {
          saved.push(...generated);
          for (const item of generated)
            seen.add(normalized(String(item.question.content)));
        } else {
          failed += 1;
          failureDetails.push({ ordinal, type, code: failureCode });
        }
        await heartbeatBackgroundJob(jobId, {
          leaseId,
          progress: Math.max(
            1,
            Math.floor(
              ((saved.length + batch.candidates.length + failed) /
                batch.requestedCount) *
                90,
            ),
          ),
          leaseDurationMs: 180_000,
        });
      }
    }
    const generatedCount = batch.candidates.length + saved.length;
    if (generatedCount === 0) {
      await failBackgroundJob(
        jobId,
        {
          leaseId,
          errorCode: "AI_QUESTION_GENERATION_FAILED",
          retryable: false,
          resourceUsage: {},
        },
        async (tx) => {
          await tx.aIQuestionGenerationBatch.update({
            where: { id: batchId },
            data: {
              status: "FAILED",
              sourceFileExpiresAt: batch.sourceFileStorageKey
                ? new Date(Date.now() + FILE_LIFETIME_MS)
                : null,
              errorCode: "AI_QUESTION_GENERATION_FAILED",
              failedCount: failed,
              failureDetails,
              provider: provider.name,
              model: provider.model,
            },
          });
        },
      );
      return;
    }
    await completeBackgroundJob(
      jobId,
      {
        leaseId,
        result: { generatedCount, failedCount: failed },
        resourceUsage: {},
      },
      async (tx) => {
        for (const item of saved) {
          await tx.aIQuestionGenerationCandidate.create({
            data: {
              batchId,
              ordinal: item.ordinal,
              questionJson: item.question,
              primaryConceptId: item.primaryConceptId,
              programmingConfig: item.programmingConfig ?? Prisma.DbNull,
              sourceRefs: item.sourceRefs,
              qualityFlags: item.qualityFlags,
            },
          });
        }
        await tx.aIQuestionGenerationBatch.update({
          where: { id: batchId },
          data: {
            status: failed ? "PARTIAL" : "READY",
            sourceFileExpiresAt: batch.sourceFileStorageKey
              ? new Date(Date.now() + FILE_LIFETIME_MS)
              : null,
            generatedCount,
            failedCount: failed,
            failureDetails,
            errorCode: failed ? "SOME_QUESTIONS_FAILED" : null,
            provider: provider.name,
            model: provider.model,
          },
        });
      },
    );
  } catch (error) {
    const code =
      error instanceof Error && /^(SOURCE_|COURSE_)/u.test(error.message)
        ? error.message
        : "AI_QUESTION_WORKER_ERROR";
    await failBackgroundJob(
      jobId,
      {
        leaseId,
        errorCode: code,
        retryable: code === "AI_QUESTION_WORKER_ERROR",
        resourceUsage: {},
      },
      async (tx, _job, willRetry) => {
        await tx.aIQuestionGenerationBatch.update({
          where: { id: batchId },
          data: {
            status: willRetry ? "PENDING" : "FAILED",
            errorCode: code,
            ...(!willRetry && batch.sourceFileStorageKey
              ? { sourceFileExpiresAt: new Date(Date.now() + FILE_LIFETIME_MS) }
              : {}),
          },
        });
      },
    );
  }
}
