import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";
import { z } from "zod";

export const qualityReportPlatformInputSchema = z
  .object({
    sourceType: z.literal(QualityReportSourceType.PLATFORM),
    gradebookId: z.string().cuid(),
    outcomeAttainmentRunId: z.string().cuid().optional(),
    courseNature: z.string().trim().max(50).default("专业(必)"),
    credits: z.coerce.number().min(0).max(20).default(0),
    majorClass: z.string().trim().max(200).default(""),
    college: z.string().trim().max(200).default(""),
    major: z.string().trim().max(200).default(""),
  })
  .strict();

export const qualityReportUploadMetadataSchema = z
  .object({
    sourceType: z.literal(QualityReportSourceType.UPLOAD),
    classroomId: z.string().cuid().optional(),
    courseNature: z.string().trim().max(50).default("专业(必)"),
    credits: z.coerce.number().min(0).max(20).default(0),
    majorClass: z.string().trim().max(200).default(""),
    college: z.string().trim().max(200).default(""),
    major: z.string().trim().max(200).default(""),
  })
  .strict();

export const reportComponentSchema = z.object({
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(300),
  weight: z.number().min(0).max(1),
});

export const reportStudentSchema = z.object({
  studentId: z.string().nullable(),
  studentNo: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100),
  status: z.nativeEnum(GradeValueStatus),
  componentScores: z.record(z.number().min(0).max(100).nullable()),
  totalScore: z.number().min(0).max(100).nullable(),
});

export const qualityReportSurveySnapshotSchema = z
  .object({
    surveyId: z.string().cuid(),
    title: z.string(),
    mode: z.enum(["IDENTIFIED", "ANONYMOUS"]),
    summaryRevisionId: z.string().cuid(),
    summaryRevisionNumber: z.number().int().positive(),
    responseCount: z.number().int().nonnegative(),
    eligibleCount: z.number().int().nonnegative(),
    responseRate: z.number().min(0).max(1),
    minSampleSize: z.number().int().positive(),
    isSuppressed: z.boolean(),
    overallMean: z.number().min(1).max(5).nullable(),
    outcomes: z.array(
      z.object({
        code: z.string(),
        title: z.string().nullable(),
        count: z.number().int().nonnegative(),
        mean: z.number().min(1).max(5),
      }),
    ),
    dimensions: z.array(
      z.object({
        code: z.string(),
        title: z.string().nullable(),
        count: z.number().int().nonnegative(),
        mean: z.number().min(1).max(5),
      }),
    ),
    themes: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        count: z.number().int().positive(),
      }),
    ),
    themeNarrative: z.string(),
    ruleVersion: z.string(),
  })
  .nullable();

export const qualityReportSourceSnapshotSchema = z.object({
  course: z.object({
    id: z.string().cuid(),
    name: z.string(),
    courseNo: z.string(),
    term: z.string(),
    teacherName: z.string(),
    courseNature: z.string(),
    credits: z.number(),
    majorClass: z.string(),
    college: z.string(),
    major: z.string(),
  }),
  classroom: z.object({ id: z.string().nullable(), name: z.string() }),
  sourceType: z.nativeEnum(QualityReportSourceType),
  components: z.array(reportComponentSchema).min(1).max(30),
  students: z.array(reportStudentSchema).min(1).max(2000),
  outcomes: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      threshold: z.number(),
      attainmentIndex: z.number().nullable(),
      participantCount: z.number().int().nonnegative(),
    }),
  ),
  attendance: z.object({
    sessionCount: z.number().int().nonnegative(),
    presentRate: z.number().min(0).max(1).nullable(),
  }),
  survey: qualityReportSurveySnapshotSchema.default(null),
  sourceReference: z.record(z.unknown()),
});

export type QualityReportSourceSnapshot = z.infer<
  typeof qualityReportSourceSnapshotSchema
>;

export const qualityReportNarrativeSchema = z
  .object({
    gradeAnalysis: z.string().trim().min(1).max(3000),
    outcomeAnalysis: z.string().trim().min(1).max(3000),
    studentEvaluation: z.string().trim().min(1).max(3000),
    summary: z.string().trim().min(1).max(3000),
  })
  .strict();

export interface QualityReportAIInput {
  course: { name: string; courseNo: string; term: string };
  statistics: {
    participantCount: number;
    mean: number | null;
    passRate: number | null;
    excellentRate: number | null;
    componentMeans: Array<{
      name: string;
      weight: number;
      mean: number | null;
    }>;
    outcomes: Array<{
      code: string;
      title: string;
      threshold: number;
      attainmentIndex: number | null;
    }>;
    attendance: { sessionCount: number; presentRate: number | null };
  };
  survey: QualityReportSourceSnapshot["survey"];
  deterministicBaseline: z.infer<typeof qualityReportNarrativeSchema>;
}
