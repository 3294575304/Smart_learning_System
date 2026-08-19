import { ZodError } from "zod";

import type { AIProvider } from "@/services/ai/provider";
import type { QualityReportStatistics } from "@/services/quality-reports/calculation";
import {
  QUALITY_REPORT_AI_TIMEOUT_MS,
  QUALITY_REPORT_MAX_AI_ATTEMPTS,
  QUALITY_REPORT_MAX_AI_TIMEOUT_MS,
} from "@/services/quality-reports/constants";
import type { QualityReportNarrative } from "@/services/quality-reports/docx-writer";
import {
  qualityReportNarrativeSchema,
  type QualityReportAIInput,
  type QualityReportSourceSnapshot,
} from "@/services/quality-reports/schemas";

function inputFor(
  source: QualityReportSourceSnapshot,
  statistics: QualityReportStatistics,
  baseline: QualityReportNarrative,
): QualityReportAIInput {
  return {
    course: {
      name: source.course.name,
      courseNo: source.course.courseNo,
      term: source.course.term,
    },
    statistics: {
      participantCount: statistics.participantCount,
      mean: statistics.mean,
      passRate: statistics.passRate,
      excellentRate: statistics.excellentRate,
      componentMeans: statistics.componentMeans.map(
        ({ name, weight, mean }) => ({ name, weight, mean }),
      ),
      outcomes: statistics.outcomes.map(
        ({ code, title, threshold, attainmentIndex }) => ({
          code,
          title,
          threshold,
          attainmentIndex,
        }),
      ),
      attendance: statistics.attendance,
    },
    survey: source.survey,
    dataAvailability: {
      publishedSyllabus: Boolean(source.syllabus),
      outcomeAttainmentCount: statistics.outcomes.filter(
        (item) => item.attainmentIndex !== null && item.threshold !== null,
      ).length,
      outcomeCount: statistics.outcomes.length,
      surveyAvailable: Boolean(source.survey),
      attendanceAvailable:
        statistics.attendance.sessionCount > 0 &&
        statistics.attendance.presentRate !== null,
    },
    deterministicBaseline: {
      gradeAnalysis: baseline.gradeAnalysis,
      outcomeAnalysis: baseline.outcomeAnalysis,
      outcomeDetails: baseline.outcomeDetails,
      studentEvaluation: baseline.studentEvaluation,
      courseSummary: baseline.courseSummary,
      improvementMeasures: baseline.improvementMeasures,
    },
  };
}

export async function executeQualityReportNarrative(
  provider: AIProvider,
  source: QualityReportSourceSnapshot,
  statistics: QualityReportStatistics,
  baseline: QualityReportNarrative,
) {
  if (!provider.writeQualityReportNarrative) {
    return {
      output: baseline,
      fallbackUsed: true,
      provider: provider.name,
      model: provider.model,
      errorCode: "PROVIDER_CAPABILITY_UNAVAILABLE",
    };
  }
  const input = inputFor(source, statistics, baseline);
  let validationError: string | undefined;
  for (
    let attempt = 0;
    attempt < QUALITY_REPORT_MAX_AI_ATTEMPTS;
    attempt += 1
  ) {
    const controller = new AbortController();
    const configuredTimeout = Number(process.env.QUALITY_REPORT_AI_TIMEOUT_MS);
    const timeout =
      Number.isInteger(configuredTimeout) && configuredTimeout > 0
        ? Math.min(configuredTimeout, QUALITY_REPORT_MAX_AI_TIMEOUT_MS)
        : QUALITY_REPORT_AI_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const raw = await provider.writeQualityReportNarrative(input, {
        signal: controller.signal,
        validationError,
      });
      const enhanced = qualityReportNarrativeSchema.parse(
        typeof raw === "string" ? JSON.parse(raw) : raw,
      );
      const expectedCodes = statistics.outcomes.map((item) => item.code).sort();
      const returnedCodes = enhanced.outcomeDetails
        .map((item) => item.code)
        .sort();
      if (
        expectedCodes.length !== returnedCodes.length ||
        expectedCodes.some((code, index) => code !== returnedCodes[index])
      )
        throw new Error("课程目标分析代码与正式统计范围不一致");
      return {
        output: { ...baseline, ...enhanced },
        fallbackUsed: false,
        provider: provider.name,
        model: provider.model,
        errorCode: null,
      };
    } catch (error) {
      validationError =
        error instanceof ZodError
          ? error.issues.map((issue) => issue.message).join("；")
          : error instanceof Error
            ? error.message
            : "输出无效";
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    output: baseline,
    fallbackUsed: true,
    provider: provider.name,
    model: provider.model,
    errorCode: "AI_NARRATIVE_INVALID",
  };
}
