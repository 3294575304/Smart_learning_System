import { QuestionType } from "@prisma/client";
import { z } from "zod";
const id = z.string().trim().min(1).max(128);
export const favoriteSourceSchema = z
  .object({
    kind: z.enum(["RECOMMENDATION", "ASSIGNMENT", "WRONG_QUESTION"]),
    id,
  })
  .strict();
export type FavoriteSource = z.output<typeof favoriteSourceSchema>;
export const favoriteSaveSchema = z
  .object({ source: favoriteSourceSchema })
  .strict();
export const favoriteNoteSchema = z
  .object({
    note: z.string().trim().max(1000),
    expectedRevision: z.number().int().min(0),
  })
  .strict();
export const favoritePracticeSchema = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const favoriteQuestionIdSchema = id;
export const favoriteQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    courseId: id.optional(),
    knowledgePointId: id.optional(),
    chapterId: id.optional(),
    type: z.nativeEnum(QuestionType).optional(),
    search: z.string().trim().max(100).optional(),
  })
  .strict();
export const favoritePointsSchema = z
  .array(z.object({ id, name: z.string().max(1000) }).strict())
  .max(100);
export interface FavoriteView {
  id: string;
  questionId: string;
  title: string;
  type: QuestionType;
  courseId: string | null;
  courseName: string;
  knowledgePoints: Array<{ id: string; name: string }>;
  note: string;
  revision: number;
  createdAt: string;
  available: boolean;
  unavailableReason: string | null;
  source: FavoriteSource;
  wrongQuestion?: { id: string; isMastered: boolean };
}
export interface FavoriteList {
  items: FavoriteView[];
  nextPage: number | null;
  total: number;
  courses: Array<{ id: string; name: string }>;
  knowledgePoints: Array<{ id: string; name: string }>;
  chapters?: Array<{ id: string; name: string }>;
}
