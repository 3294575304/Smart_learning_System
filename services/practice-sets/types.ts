import type { QuestionType, RecommendationStatus } from "@prisma/client";
import { z } from "zod";
export const practiceSetQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    courseId: z.string().trim().min(1).max(128).optional(),
    status: z.enum(["ACTIVE", "COMPLETED", "EXPIRED"]).optional(),
  })
  .strict();
export interface PracticeSetQuestion {
  id: string;
  title: string;
  type: QuestionType;
  status: RecommendationStatus;
}
export interface PracticeSet {
  id: string;
  courseId: string | null;
  courseName: string;
  title: string;
  generatedAt: string;
  status: "ACTIVE" | "COMPLETED" | "EXPIRED";
  total: number;
  completed: number;
  entryId: string;
  knowledgePoints: string[];
  questions: PracticeSetQuestion[];
}
export interface PracticeSetList {
  items: PracticeSet[];
  courses: Array<{ id: string; name: string }>;
  nextPage: number | null;
  total: number;
}
export function practiceSetStatus(
  statuses: RecommendationStatus[],
): PracticeSet["status"] {
  if (statuses.length && statuses.every((status) => status === "COMPLETED"))
    return "COMPLETED";
  if (statuses.some((status) => status === "PENDING" || status === "STARTED"))
    return "ACTIVE";
  return "EXPIRED";
}
export function practiceSetEntry(questions: PracticeSetQuestion[]): string {
  return (
    questions.find((item) => item.status === "STARTED")?.id ??
    questions.find((item) => item.status === "PENDING")?.id ??
    questions.find((item) => item.status === "COMPLETED")?.id ??
    questions[0]?.id ??
    ""
  );
}
