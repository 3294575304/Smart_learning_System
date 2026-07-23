import type {
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
  Role,
} from "@prisma/client";

export interface AdminQuestionView {
  id: string;
  title: string;
  content: string;
  type: QuestionType;
  difficulty: number;
  explanation: string;
  correctBoolean: boolean | null;
  referenceAnswer: string | null;
  acceptableAnswers: string[];
  isCaseSensitive: boolean;
  status: QuestionStatus;
  visibility: QuestionVisibility;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  creator: {
    id: string;
    displayName: string;
    email: string;
    role: Role;
  };
  source: "ADMIN" | "TEACHER_HISTORY";
  knowledgePoints: Array<{ id: string; code: string; name: string }>;
  options: Array<{
    id: string;
    label: string;
    content: string;
    isCorrect: boolean;
    sortOrder: number;
  }>;
  assignmentReferenceCount: number;
}

export interface AdminQuestionListResult {
  items: AdminQuestionView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminQuestionCreatorOption {
  id: string;
  displayName: string;
  email: string;
  role: Role;
}
