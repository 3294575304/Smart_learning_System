import { getPilotAIProvider } from "@/services/ai/gateway";
import type { AIProvider } from "@/services/ai/provider";
import { executeQualityReportNarrative } from "@/services/quality-reports/ai-execution";
import type { QualityReportNarrative } from "@/services/quality-reports/docx-writer";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";
import type { QualityReportStatistics } from "@/services/quality-reports/calculation";

export async function enhanceQualityReportNarrative(
  source: QualityReportSourceSnapshot,
  statistics: QualityReportStatistics,
  baseline: QualityReportNarrative,
  backgroundJobId: string,
  teacherId: string,
  injectedProvider?: AIProvider,
) {
  const { provider, errorCode } = await getPilotAIProvider(
    {
      capability: "quality_report",
      actorId: teacherId,
      requestId: backgroundJobId,
    },
    injectedProvider,
  );
  if (!provider)
    return {
      output: baseline,
      fallbackUsed: true,
      provider: null,
      model: null,
      errorCode,
    };
  return executeQualityReportNarrative(provider, source, statistics, baseline);
}
