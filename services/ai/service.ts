import "server-only";

import {
  AIAnalysisScope,
  AIInsightType,
  AIRecordStatus,
  Prisma,
  RiskLevel,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { analyzeStudentPerformance } from "@/services/ai/analyzer";
import {
  DEFAULT_AI_TIMEOUT_MS,
  MAX_AI_TIMEOUT_MS,
  STUDENT_ANALYSIS_PROMPT_VERSION,
} from "@/services/ai/constants";
import { AIAnalysisOperationError } from "@/services/ai/errors";
import { generateRuleBasedAnalysis } from "@/services/ai/fallback";
import { buildStudentAnalysisInput } from "@/services/ai/input-builder";
import type { AIProvider } from "@/services/ai/provider";
import { createAIProvider } from "@/services/ai/provider-factory";
import { createAnalysisRequestKey } from "@/services/ai/request-key";
import {
  studentAnalysisOutputSchema,
  type StudentAnalysisOutput,
} from "@/services/ai/schemas";
import { ResourceNotFoundError } from "@/services/auth/policy";

function configuredTimeoutMs(): number {
  const parsed = Number(process.env.AI_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_AI_TIMEOUT_MS;
  return Math.min(Math.trunc(parsed), MAX_AI_TIMEOUT_MS);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function riskLevelFor(output: StudentAnalysisOutput): RiskLevel {
  const maximumSeverity = output.weakKnowledgePoints.reduce(
    (maximum, item) => Math.max(maximum, item.severity),
    0,
  );
  if (maximumSeverity >= 5) return RiskLevel.CRITICAL;
  if (maximumSeverity >= 4) return RiskLevel.HIGH;
  if (maximumSeverity >= 3) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

function summaryFor(output: StudentAnalysisOutput): string {
  return `总体水平：${output.overallLevel}；已掌握 ${output.masteredKnowledgePoints.length} 个知识点，薄弱 ${output.weakKnowledgePoints.length} 个知识点；推荐难度 ${output.recommendedDifficulty}。`;
}

function insightRows(
  analysisId: string,
  output: StudentAnalysisOutput,
): Prisma.AIAnalysisInsightCreateManyInput[] {
  return [
    ...output.masteredKnowledgePoints.map((item) => ({
      analysisId,
      knowledgePointId: item.knowledgePointId,
      type: AIInsightType.STRENGTH,
      title: "已掌握知识点",
      detail: item.reason,
      priority: 1,
    })),
    ...output.weakKnowledgePoints.map((item) => ({
      analysisId,
      knowledgePointId: item.knowledgePointId,
      type: AIInsightType.WEAKNESS,
      title: "薄弱知识点",
      detail: item.reason,
      priority: item.severity,
      metricName: "severity",
      metricValue: new Prisma.Decimal(item.severity),
    })),
    ...output.errorPatterns.map((item) => ({
      analysisId,
      type: AIInsightType.RISK,
      title: `错误模式：${item.type}`,
      detail: item.evidence,
      priority: 1,
    })),
    ...output.suggestions.map((suggestion, index) => ({
      analysisId,
      type: AIInsightType.SUGGESTION,
      title: "学习建议",
      detail: suggestion,
      priority: output.suggestions.length - index,
      recommendedAction: suggestion,
    })),
  ];
}

async function existingOutput(
  requestKey: string,
): Promise<StudentAnalysisOutput | null> {
  const existing = await prisma.aIAnalysis.findUnique({
    where: { requestKey },
    select: { status: true, rawResponse: true },
  });
  if (!existing) return null;
  if (existing.status === AIRecordStatus.PENDING) {
    throw new AIAnalysisOperationError("相同数据的学情分析正在处理中");
  }
  const parsed = studentAnalysisOutputSchema.safeParse(existing.rawResponse);
  if (!parsed.success) {
    throw new AIAnalysisOperationError(
      "已有分析记录无法读取，请更新数据后重试",
    );
  }
  return parsed.data;
}

export async function getStudentAnalysis(
  studentId: string,
  submissionId: string,
): Promise<StudentAnalysisOutput> {
  const batch = await buildStudentAnalysisInput(studentId, submissionId);
  const requestKey = createAnalysisRequestKey(
    batch.input,
    STUDENT_ANALYSIS_PROMPT_VERSION,
  );
  const output = await existingOutput(requestKey);
  if (!output) throw new ResourceNotFoundError("尚未生成当前数据的学情分析");
  return output;
}

export async function createStudentAnalysis(
  studentId: string,
  submissionId: string,
  injectedProvider?: AIProvider,
): Promise<StudentAnalysisOutput> {
  const batch = await buildStudentAnalysisInput(studentId, submissionId);
  const requestKey = createAnalysisRequestKey(
    batch.input,
    STUDENT_ANALYSIS_PROMPT_VERSION,
  );
  const reused = await existingOutput(requestKey);
  if (reused) return reused;

  let analysis: { id: string };
  try {
    analysis = await prisma.aIAnalysis.create({
      data: {
        requestKey,
        requestedById: studentId,
        studentId,
        scope: AIAnalysisScope.STUDENT,
        status: AIRecordStatus.PENDING,
        promptVersion: STUDENT_ANALYSIS_PROMPT_VERSION,
        sampleSize: batch.sampleSize,
        basedOnFrom: batch.basedOnFrom,
        basedOnTo: batch.basedOnTo,
        overallScore: new Prisma.Decimal(
          (batch.overallAccuracy * 100).toFixed(2),
        ),
        inputMetrics: {
          sampleSize: batch.sampleSize,
          correctRate: Number(batch.overallAccuracy.toFixed(4)),
          responseTimeSampleSize: batch.input.answers.filter(
            (answer) => answer.responseTimeMs !== null,
          ).length,
          historicalKnowledgePointCount:
            batch.input.historicalKnowledgePointAccuracy.length,
          recentErrorCount: batch.input.recentErrors.length,
          tutoringSummaryCount: batch.input.tutoringSummaries.length,
        },
      },
      select: { id: true },
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrentOutput = await existingOutput(requestKey);
      if (concurrentOutput) return concurrentOutput;
    }
    throw error;
  }

  let provider: AIProvider | null = injectedProvider ?? null;
  let execution:
    Awaited<ReturnType<typeof analyzeStudentPerformance>> | undefined;
  if (!provider) {
    try {
      provider = createAIProvider();
    } catch {
      provider = null;
    }
  }

  if (provider) {
    execution = await analyzeStudentPerformance(
      provider,
      batch.input,
      configuredTimeoutMs(),
    );
  } else {
    execution = {
      output: generateRuleBasedAnalysis(batch.input),
      retryCount: 0,
      fallbackUsed: true,
      errorCode: "PROVIDER_CONFIGURATION_ERROR",
      latencyMs: 0,
    };
  }

  const completedAt = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.aIAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: execution.fallbackUsed
          ? AIRecordStatus.FALLBACK
          : AIRecordStatus.SUCCEEDED,
        riskLevel: riskLevelFor(execution.output),
        summary: summaryFor(execution.output),
        provider: provider?.name ?? "rule",
        model: provider?.model ?? "rule-fallback-v1",
        retryCount: execution.retryCount,
        fallbackUsed: execution.fallbackUsed,
        rawResponse: toJsonValue(execution.output),
        errorCode: execution.errorCode,
        completedAt,
        inputMetrics: {
          sampleSize: batch.sampleSize,
          correctRate: Number(batch.overallAccuracy.toFixed(4)),
          responseTimeSampleSize: batch.input.answers.filter(
            (answer) => answer.responseTimeMs !== null,
          ).length,
          historicalKnowledgePointCount:
            batch.input.historicalKnowledgePointAccuracy.length,
          recentErrorCount: batch.input.recentErrors.length,
          tutoringSummaryCount: batch.input.tutoringSummaries.length,
          latencyMs: execution.latencyMs,
        },
      },
    });
    const rows = insightRows(analysis.id, execution.output);
    if (rows.length > 0) {
      await transaction.aIAnalysisInsight.createMany({ data: rows });
    }
  });

  return execution.output;
}
