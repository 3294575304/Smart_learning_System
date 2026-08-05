import type { StudentAnalysisInput } from "@/services/ai/schemas";
import type { SyllabusParseInput } from "@/services/syllabus-parsing/schemas";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

export interface AIProviderOptions {
  signal: AbortSignal;
  validationError?: string;
}

export interface AIProviderResponse {
  content: unknown;
  requestId: string | null;
  finishReason: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  responseLength: number;
}

export class AIProviderRequestError extends Error {
  constructor(
    message: string,
    readonly code: "PROVIDER_TIMEOUT" | "PROVIDER_UNAVAILABLE",
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "AIProviderRequestError";
  }
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

  inferKnowledgeGraphRelations?(
    input: KnowledgeGraphStructure,
    options: AIProviderOptions,
  ): Promise<unknown>;
}
