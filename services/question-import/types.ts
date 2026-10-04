import type { ProgrammingConfigRevisionInput } from "@/services/programming-questions/schemas";
import type { QuestionType } from "@prisma/client";
import type { QuestionAnswer } from "@/services/questions/types";

export type QuestionImportFormat = "DOC" | "DOCX" | "PDF" | "TXT" | "JSON";

export interface QuestionImportCourseOption {
  id: string;
  name: string;
  courseNo: string;
  term: string;
}

export interface QuestionImportOption {
  label: string;
  content: string;
  sortOrder: number;
}

export interface QuestionImportDraft {
  rowKey: string;
  originalNumber: string | null;
  title: string;
  content: string;
  type: QuestionType;
  difficulty: number;
  options: QuestionImportOption[];
  answer: QuestionAnswer | null;
  explanation: string;
  tags: string[];
  issues: string[];
  duplicate: boolean;
  programmingConfig?: ProgrammingConfigRevisionInput;
  programmingConfigText?: string;
}

export interface QuestionImportPreview {
  source: {
    fileName: string;
    format: QuestionImportFormat;
    size: number;
    checksum: string;
  };
  questions: QuestionImportDraft[];
  warnings: string[];
  suggestedKnowledgePointIds: string[];
  summary: {
    total: number;
    ready: number;
    needsReview: number;
    duplicates: number;
  };
}
