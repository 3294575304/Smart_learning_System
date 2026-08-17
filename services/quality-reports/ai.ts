import { createAIProvider } from "@/services/ai/provider-factory";
import type { AIProvider } from "@/services/ai/provider";
import { executeQualityReportNarrative } from "@/services/quality-reports/ai-execution";
import type { QualityReportNarrative } from "@/services/quality-reports/docx-writer";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";
import type { QualityReportStatistics } from "@/services/quality-reports/calculation";
import { getSystemConfigValue } from "@/services/system-config/service";

export async function enhanceQualityReportNarrative(
  source: QualityReportSourceSnapshot,
  statistics: QualityReportStatistics,
  baseline: QualityReportNarrative,
  injectedProvider?: AIProvider,
) {
  let enabled = false;
  try {
    enabled = await getSystemConfigValue("aiAnalysisEnabled");
  } catch {
    enabled = false;
  }
  if (!enabled)
    return {
      output: baseline,
      fallbackUsed: true,
      provider: null,
      model: null,
      errorCode: "AI_DISABLED_BY_SYSTEM_CONFIG",
    };
  let provider = injectedProvider ?? null;
  if (!provider) {
    try {
      provider = createAIProvider();
    } catch {
      return {
        output: baseline,
        fallbackUsed: true,
        provider: null,
        model: null,
        errorCode: "PROVIDER_CONFIGURATION_ERROR",
      };
    }
  }
  return executeQualityReportNarrative(provider, source, statistics, baseline);
}
