import type { StudentAnalysisInput } from "@/services/ai/schemas";
import type { SyllabusParseInput } from "@/services/syllabus-parsing/schemas";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";
import type { QuestionMappingAIInput } from "@/services/question-mapping/schemas";
import type { SelfReflectionAIInput } from "@/services/self-reflections/schemas";

export interface AIProviderOptions {
  signal: AbortSignal;
  validationError?: string;
}

export interface AIProviderResponse {
  content: unknown;
  requestId: string | null;
  finishReason: string | null;
  parseBranch?: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
  responseLength: number;
}

export type AIEndpointType = "chat-completions" | "responses";

export type AIProviderErrorCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_UNAUTHORIZED"
  | "PROVIDER_FORBIDDEN"
  | "PROVIDER_MODEL_NOT_FOUND"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_HTTP_ERROR"
  | "PROVIDER_EMPTY_RESPONSE"
  | "PROVIDER_UNREADABLE_RESPONSE"
  | "PROVIDER_BAD_RESPONSE"
  | "PROVIDER_SCHEMA_INVALID"
  | "PROVIDER_UNAVAILABLE";

export interface AIProviderErrorMetadata {
  provider?: string;
  model?: string;
  endpointType?: AIEndpointType;
  httpStatus?: number | null;
  contentType?: string | null;
  requestId?: string | null;
  parseBranch?: string | null;
  responseSummary?: string;
}

export class AIProviderRequestError extends Error {
  constructor(
    message: string,
    readonly code: AIProviderErrorCode,
    readonly requestId: string | null = null,
    readonly metadata: AIProviderErrorMetadata = {},
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

  mapQuestionsToConcepts?(
    input: QuestionMappingAIInput,
    options: AIProviderOptions,
  ): Promise<unknown>;

  structureSelfReflection?(
    input: SelfReflectionAIInput,
    options: AIProviderOptions,
  ): Promise<unknown>;
}
