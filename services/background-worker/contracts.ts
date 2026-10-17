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
    // One course-level job can contain up to 500 IDs. The mapping service
    // sends them to the AI provider in groups of 50.
    questionIds: z.array(z.string().cuid()).min(1).max(500),
    context: auditContextSchema,
  })
  .strict();
