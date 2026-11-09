import "server-only";

import {
  AIProviderRequestError,
  type AIProvider,
} from "@/services/ai/provider";
import type { AIRequestScope } from "@/services/ai/governance";
import { createAIProvider } from "@/services/ai/provider-factory";
import { getSystemConfigValue } from "@/services/system-config/service";

export async function getPilotAIProvider(
  scope: AIRequestScope,
  injectedProvider?: AIProvider,
) {
  try {
    if (
      process.env.AI_PILOT_EXTERNAL_CALLS_DISABLED === "true" ||
      !(await getSystemConfigValue("aiAnalysisEnabled"))
    ) {
      return { provider: null, errorCode: "AI_DISABLED_BY_SYSTEM_CONFIG" };
    }
    return {
      provider: injectedProvider ?? createAIProvider(scope),
      errorCode: null,
    };
  } catch (error) {
    return {
      provider: null,
      errorCode:
        error instanceof AIProviderRequestError
          ? "PROVIDER_CONFIGURATION_ERROR"
          : "AI_CONFIGURATION_UNAVAILABLE",
    };
  }
}

export function aiAttemptErrorCode(error: unknown) {
  if (error instanceof AIProviderRequestError) return error.code;
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  )
    return error.name === "TimeoutError"
      ? "PROVIDER_TIMEOUT"
      : "REQUEST_ABORTED";
  return "PROVIDER_UNAVAILABLE";
}
