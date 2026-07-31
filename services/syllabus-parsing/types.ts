import type { SyllabusParseStatus } from "@prisma/client";

import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";

export interface SyllabusParseDraftView {
  id: string;
  courseId: string;
  syllabus: {
    id: string;
    versionNumber: number;
    originalName: string;
  };
  isCurrentSyllabusVersion: boolean;
  status: SyllabusParseStatus;
  parserVersion: string;
  promptVersion: string;
  ruleVersion: string;
  provider: string | null;
  model: string | null;
  retryCount: number;
  executionCount: number;
  result: SyllabusParseOutput | null;
  errorCode: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
