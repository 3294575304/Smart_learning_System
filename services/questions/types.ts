import type { QuestionStatus, QuestionType } from "@prisma/client";

export type QuestionAnswer =
  | { kind: "CHOICE"; correctOptionLabels: string[] }
  | { kind: "BOOLEAN"; value: boolean }
  | {
      kind: "TEXT";
      acceptableAnswers: string[];
      caseSensitive: boolean;
    }
  | { kind: "REFERENCE"; value: string }
  | { kind: "PROGRAMMING" };

export interface QuestionOptionData {
  id?: string;
  label: string;
  content: string;
  sortOrder: number;
}

export interface QuestionKnowledgePointData {
  id: string;
  code: string;
  name: string;
}

export interface QuestionCreatorData {
  id: string;
  displayName: string | null;
}

export interface QuestionListItem {
  id: string;
  title: string;
  content: string;
  type: QuestionType;
  difficulty: number;
  status: QuestionStatus;
  questionCategoryId: string | null;
  questionCategoryName: string | null;
  revision: number;
  tags: string[];
  creator: QuestionCreatorData;
  knowledgePoints: QuestionKnowledgePointData[];
  courseGraphConcepts?: Array<{ id: string; code: string; name: string }>;
  assignmentReferenceCount: number;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionDetail extends QuestionListItem {
  explanation: string;
  options: QuestionOptionData[];
  answer: QuestionAnswer;
}

export interface QuestionPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface QuestionListResult {
  items: QuestionListItem[];
  pagination: QuestionPagination;
}

export interface QuestionReferenceCounts {
  assignments: number;
  recommendations: number;
  tutoringRecords: number;
}

export interface DeleteQuestionResult {
  questionId: string;
  mode: "ARCHIVED";
  references: QuestionReferenceCounts;
}

export interface KnowledgePointOption {
  id: string;
  code: string;
  name: string;
}
