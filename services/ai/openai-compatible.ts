import { z } from "zod";

import { buildStudentAnalysisMessages } from "@/services/ai/prompt";
import type { AIProvider, AIProviderOptions } from "@/services/ai/provider";
import type { StudentAnalysisInput } from "@/services/ai/schemas";

const completionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
});

export interface OpenAICompatibleProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai-compatible";
  readonly model: string;
  private readonly endpoint: string;

  constructor(private readonly config: OpenAICompatibleProviderConfig) {
    this.model = config.model;
    this.endpoint = `${config.baseUrl.replace(/\/$/u, "")}/chat/completions`;
  }

  async analyzeStudentPerformance(
    input: StudentAnalysisInput,
    options: AIProviderOptions,
  ): Promise<unknown> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: buildStudentAnalysisMessages(input, options.validationError),
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(`AI provider returned HTTP ${response.status}`);
    }
    const payload: unknown = await response.json();
    return completionResponseSchema.parse(payload).choices[0].message.content;
  }
}
