import { z } from "zod";

const auditContextSchema = z
  .object({
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
  })
  .strict()
  .default({ ipAddress: null, userAgent: null });

const commonInput = {
  teacherId: z.string().cuid(),
  courseId: z.string().cuid(),
};

export const qualityReportJobInputSchema = z
  .object({
    reportId: z.string().cuid(),
    context: auditContextSchema.optional(),
  })
  .strict();

export const knowledgeGraphJobInputSchema = z
  .object({
    ...commonInput,
    draftId: z.string().cuid(),
    context: auditContextSchema.optional(),
  })
  .strict();

export const syllabusParseJobInputSchema = z
  .object({ ...commonInput, draftId: z.string().cuid() })
  .strict();

export const questionMappingJobInputSchema = z
  .object({
    ...commonInput,
    batchId: z.string().cuid(),
    questionIds: z.array(z.string().cuid()).min(1).max(50),
    context: auditContextSchema,
  })
  .strict();
