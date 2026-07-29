import type {
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
} from "@prisma/client";

export type QuestionScope = "OWNED" | "PUBLIC";

export type QuestionAnswer =
  | { kind: "CHOICE"; correctOptionLabels: string[] }
  | { kind: "BOOLEAN"; value: boolean }
  | {
      kind: "TEXT";
      acceptableAnswers: string[];
      caseSensitive: boolean;
    }
  | { kind: "REFERENCE"; value: string };

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
  visibility: QuestionVisibility;
  tags: string[];
  creator: QuestionCreatorData;
  knowledgePoints: QuestionKnowledgePointData[];
  assignmentReferenceCount: number;
  canEdit: boolean;
  canDelete: boolean;
  canCopy: boolean;
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
  mode: "PHYSICAL" | "ARCHIVED";
  references: QuestionReferenceCounts;
}

export interface KnowledgePointOption {
  id: string;
  code: string;
  name: string;
}
