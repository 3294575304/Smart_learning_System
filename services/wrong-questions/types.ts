import type { GradingStatus, QuestionType } from "@prisma/client";

export type WrongQuestionSourceType = "ASSIGNMENT" | "RECOMMENDATION";

export interface WrongQuestionKnowledgePoint {
  id: string;
  name: string;
}

export interface WrongQuestionListItem {
  id: string;
  questionId: string;
  summary: string;
  title: string;
  type: QuestionType;
  knowledgePoints: WrongQuestionKnowledgePoint[];
  wrongCount: number;
  lastWrongAt: Date;
  recentWrongAnswer: string;
  isMastered: boolean;
  masteredAt: Date | null;
  sourceType: WrongQuestionSourceType;
  sourceLabel: string;
  sourceRecordId: string;
  classroom: { id: string; name: string } | null;
}

export interface WrongQuestionDetail extends WrongQuestionListItem {
  content: string;
  correctAnswer: string;
  explanation: string;
  options: Array<{
    id: string;
    label: string;
    content: string;
    sortOrder: number;
  }>;
}

export interface WrongQuestionListResult {
  summary: {
    total: number;
    unmastered: number;
    mastered: number;
  };
  filterOptions: {
    classrooms: Array<{ id: string; name: string }>;
    knowledgePoints: WrongQuestionKnowledgePoint[];
  };
  items: WrongQuestionListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface WrongQuestionMasteryResult {
  id: string;
  isMastered: boolean;
  masteredAt: Date | null;
}

export interface WrongQuestionPracticeResult {
  gradingStatus: GradingStatus;
  isCorrect: boolean | null;
  studentAnswer: string;
  correctAnswer: string;
  explanation: string;
  canMarkMastered: boolean;
}
