import { z } from "zod";

export const programmingCodeScoreInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    question: z.string().trim().min(1).max(8_000),
    referenceCode: z.string().min(1).max(50_000),
    studentCode: z.string().min(1).max(50_000),
  })
  .strict();

const normalizedValue = z.number().finite().min(0).max(1);

export const programmingCodeScoreReviewSchema = z
  .object({
    functionalPoints: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(300),
            importance: normalizedValue,
            coverage: normalizedValue,
          })
          .strict(),
      )
      .min(1)
      .max(12),
    commentPairs: z
      .array(
        z
          .object({
            comment: z.string().trim().min(1).max(300),
            code: z.string().trim().min(1).max(500),
            consistent: z.boolean(),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();

export type ProgrammingCodeScoreInput = z.infer<
  typeof programmingCodeScoreInputSchema
>;
export type ProgrammingCodeScoreReview = z.infer<
  typeof programmingCodeScoreReviewSchema
>;

export interface ProgrammingPaperScoreSuggestion {
  algorithmVersion: string;
  promptVersion: string;
  model: string;
  score: number;
  scoreOnHundred: number;
  maxScore: number;
  weights: {
    semantic: number;
    structure: number;
    commentConsistency: number;
  };
  dimensions: {
    semantic: number;
    structure: number;
    commentConsistency: number;
  };
  functionalPointCount: number;
  checkedCommentCount: number;
  mismatchedCommentCount: number;
  commentEvidenceMissing: boolean;
  review: ProgrammingCodeScoreReview;
}
