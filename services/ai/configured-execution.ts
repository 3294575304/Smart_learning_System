import { analyzeStudentPerformance } from "@/services/ai/analyzer";
import { generateRuleBasedAnalysis } from "@/services/ai/fallback";
import type { AIProvider } from "@/services/ai/provider";
import type { StudentAnalysisInput } from "@/services/ai/schemas";

export async function executeConfiguredStudentAnalysis(
  enabled: boolean,
  provider: AIProvider | null,
  input: StudentAnalysisInput,
  timeoutMs: number,
) {
  if (enabled && provider) {
    return analyzeStudentPerformance(provider, input, timeoutMs);
  }
  return {
    output: generateRuleBasedAnalysis(input),
    retryCount: 0,
    fallbackUsed: true,
    errorCode: enabled
      ? "PROVIDER_CONFIGURATION_ERROR"
      : "AI_DISABLED_BY_SYSTEM_CONFIG",
    latencyMs: 0,
  };
}
