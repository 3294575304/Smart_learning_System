import type { PracticeManagementView } from "./management-schemas";
import type { QuestionType, RecommendationStatus } from "@prisma/client";
import { z } from "zod";
export const practiceSetQuerySchema = z
  .object({
    section: z.enum(["ACTIVE", "HISTORY", "TRASH"]).optional(),
    keyword: z.string().trim().max(100).optional(),
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
  readOnly?: boolean;
  assignedPoints?: number | null;
  score?: number | null;
  maxScore?: number | null;
  judgingStatus?: string | null;
}
export interface PracticeSet {
  management?: PracticeManagementView;
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
  section?: "ACTIVE" | "HISTORY" | "TRASH";
  counts?: { ACTIVE: number; HISTORY: number; TRASH: number };
  page?: number;
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

export function canAnswerPractice(item: {
  status: RecommendationStatus;
  readOnly?: boolean;
}) {
  return (
    !item.readOnly && (item.status === "PENDING" || item.status === "STARTED")
  );
}
