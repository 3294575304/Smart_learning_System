import "server-only";

import { prisma } from "@/lib/prisma";
import { createAIProvider } from "@/services/ai/provider-factory";
import { AIProviderRequestError } from "@/services/ai/provider";
import {
  createBackgroundJob,
  completeBackgroundJob,
  failBackgroundJob,
} from "@/services/background-jobs/repository";
import { storedPublishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";
import {
  QUESTION_OBJECTIVE_JOB_TYPE,
  QUESTION_OBJECTIVE_PROMPT_VERSION,
  parseQuestionObjectiveSuggestion,
  questionObjectiveJobInputSchema,
  type QuestionObjectiveAIInput,
} from "./schemas";

const genericObjectives = [
  {
    code: "KNOWLEDGE",
    title: "1 · 知识",
    description: "概念、事实与原理的理解和记忆",
  },
  {
    code: "ABILITY",
    title: "2 · 能力",
    description: "知识运用、分析、设计与问题解决",
  },
  {
    code: "LITERACY",
    title: "3 · 素养",
    description: "责任、伦理、规范与综合素养",
  },
];

type GenericCandidate = { questionId: string; revision: number };
type CourseCandidate = GenericCandidate & {
  courseId: string;
  syllabusStructureId: string;
};

export async function enqueueMissingQuestionObjectiveJobs() {
  const generic = await prisma.$queryRaw<GenericCandidate[]>`
    SELECT q.id AS "questionId", q.revision
    FROM "Question" q
    WHERE q."defaultObjectiveKind" IS NULL AND q."deletedAt" IS NULL
      AND q.status IN ('ACTIVE', 'DRAFT')
      AND NOT EXISTS (
        SELECT 1 FROM "BackgroundJob" j WHERE j.type = ${QUESTION_OBJECTIVE_JOB_TYPE}
          AND j."idempotencyKey" = q.id || ':base:' || q.revision
      )
    ORDER BY q."createdAt", q.id LIMIT 10
  `;
  for (const row of generic)
    await createBackgroundJob({
      type: QUESTION_OBJECTIVE_JOB_TYPE,
      idempotencyKey: `${row.questionId}:base:${row.revision}`,
      input: {
        questionId: row.questionId,
        revision: row.revision,
        courseId: null,
        syllabusStructureId: null,
      },
      maxAttempts: 3,
    });
  const course = await prisma.$queryRaw<CourseCandidate[]>`
    SELECT q.id AS "questionId", q.revision, c.id AS "courseId",
      c."currentPublishedSyllabusStructureId" AS "syllabusStructureId"
    FROM "Question" q JOIN "Course" c ON c."questionCategoryId" = q."questionCategoryId"
    WHERE q."deletedAt" IS NULL AND q.status IN ('ACTIVE', 'DRAFT')
      AND c.status <> 'ARCHIVED' AND c."currentPublishedSyllabusStructureId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "QuestionCourseObjective" m WHERE m."questionId" = q.id
          AND m."courseId" = c.id AND m."syllabusStructureId" = c."currentPublishedSyllabusStructureId"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "BackgroundJob" j WHERE j.type = ${QUESTION_OBJECTIVE_JOB_TYPE}
          AND j."idempotencyKey" = q.id || ':course:' || c.id || ':' || c."currentPublishedSyllabusStructureId" || ':' || q.revision
      )
    ORDER BY q."createdAt", q.id, c.id LIMIT 10
  `;
  for (const row of course)
    await createBackgroundJob({
      type: QUESTION_OBJECTIVE_JOB_TYPE,
      idempotencyKey: `${row.questionId}:course:${row.courseId}:${row.syllabusStructureId}:${row.revision}`,
      courseId: row.courseId,
      input: row,
      maxAttempts: 3,
    });
}

export async function executeClaimedQuestionObjectiveJob(
  jobId: string,
  leaseId: string,
  raw: unknown,
) {
  const input = questionObjectiveJobInputSchema.parse(raw);
  try {
    const question = await prisma.question.findFirst({
      where: {
        id: input.questionId,
        revision: input.revision,
        deletedAt: null,
      },
      select: {
        id: true,
        revision: true,
        title: true,
        content: true,
        type: true,
        questionCategoryId: true,
        options: { select: { content: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!question) {
      await completeBackgroundJob(jobId, {
        leaseId,
        result: { stale: true },
        resourceUsage: {},
      });
      return;
    }
    let objectives: QuestionObjectiveAIInput["objectives"] = genericObjectives;
    if (input.courseId && input.syllabusStructureId) {
      if (!question.questionCategoryId) {
        await completeBackgroundJob(jobId, {
          leaseId,
          result: { stale: true },
          resourceUsage: {},
        });
        return;
      }
      const course = await prisma.course.findFirst({
        where: {
          id: input.courseId,
          currentPublishedSyllabusStructureId: input.syllabusStructureId,
          questionCategoryId: question.questionCategoryId,
        },
        select: {
          currentPublishedSyllabusStructure: {
            select: { structureJson: true },
          },
        },
      });
      if (!course) {
        await completeBackgroundJob(jobId, {
          leaseId,
          result: { stale: true },
          resourceUsage: {},
        });
        return;
      }
      const syllabus = storedPublishableSyllabusStructureSchema.parse(
        course.currentPublishedSyllabusStructure?.structureJson,
      );
      objectives = syllabus.objectives.map(({ code, title, description }) => ({
        code,
        title,
        description: description.slice(0, 1_200),
      }));
    }
    const provider = createAIProvider();
    if (!provider.classifyQuestionObjective)
      throw new Error("AI_OBJECTIVE_UNSUPPORTED");
    const output = parseQuestionObjectiveSuggestion(
      await provider.classifyQuestionObjective(
        {
          title: question.title,
          content: question.content,
          type: question.type,
          options: question.options,
          objectives,
        },
        { signal: AbortSignal.timeout(60_000) },
      ),
      objectives.map(({ code }) => code),
    );
    await completeBackgroundJob(
      jobId,
      {
        leaseId,
        result: {
          objectiveCode: output.objectiveCode,
          confidence: output.confidence,
          reason: output.reason,
          provider: provider.name,
          model: provider.model,
          promptVersion: QUESTION_OBJECTIVE_PROMPT_VERSION,
        },
        resourceUsage: {},
      },
      async (tx) => {
        if (input.courseId && input.syllabusStructureId) {
          const current = await tx.course.findFirst({
            where: {
              id: input.courseId,
              currentPublishedSyllabusStructureId: input.syllabusStructureId,
            },
            select: { id: true },
          });
          const revision = await tx.question.findFirst({
            where: { id: question.id, revision: input.revision },
            select: { id: true },
          });
          if (current && revision)
            await tx.questionCourseObjective.createMany({
              data: [
                {
                  questionId: question.id,
                  courseId: input.courseId,
                  syllabusStructureId: input.syllabusStructureId,
                  objectiveCode: output.objectiveCode,
                  source: "AI",
                },
              ],
              skipDuplicates: true,
            });
        } else {
          await tx.question.updateMany({
            where: {
              id: question.id,
              revision: input.revision,
              defaultObjectiveKind: null,
            },
            data: { defaultObjectiveKind: output.objectiveCode },
          });
        }
      },
    );
  } catch (error) {
    await failBackgroundJob(jobId, {
      leaseId,
      errorCode:
        error instanceof AIProviderRequestError
          ? error.code
          : "AI_OBJECTIVE_FAILED",
      retryable: true,
      resourceUsage: {},
    });
  }
}
