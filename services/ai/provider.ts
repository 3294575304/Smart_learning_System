import type { StudentAnalysisInput } from "@/services/ai/schemas";
import type { SyllabusParseInput } from "@/services/syllabus-parsing/schemas";

export interface AIProviderOptions {
  signal: AbortSignal;
  validationError?: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;

  analyzeStudentPerformance(
    input: StudentAnalysisInput,
    options: AIProviderOptions,
  ): Promise<unknown>;

  parseSyllabus(
    input: SyllabusParseInput,
    options: AIProviderOptions,
  ): Promise<unknown>;
}
