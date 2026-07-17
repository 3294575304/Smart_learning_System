import { generateRuleBasedAnalysis } from "@/services/ai/fallback";
import type { AIProvider, AIProviderOptions } from "@/services/ai/provider";
import type { StudentAnalysisInput } from "@/services/ai/schemas";

export type MockAIResponder = (
  input: StudentAnalysisInput,
  options: AIProviderOptions,
) => unknown | Promise<unknown>;

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  readonly model: string;

  constructor(
    private readonly responder: MockAIResponder = generateRuleBasedAnalysis,
    model = "mock-student-analyzer-v1",
  ) {
    this.model = model;
  }

  async analyzeStudentPerformance(
    input: StudentAnalysisInput,
    options: AIProviderOptions,
  ): Promise<unknown> {
    if (options.signal.aborted) {
      throw new DOMException("AI request aborted", "AbortError");
    }
    return this.responder(input, options);
  }
}
