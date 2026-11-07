import "server-only";

import { AIRecordStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { percentage } from "@/services/admin/dashboard/metrics";
import { createAIProvider } from "@/services/ai/provider-factory";
import {
  AIProviderRequestError,
  type AIProviderErrorCode,
  type AIProvider,
} from "@/services/ai/provider";
import { deriveAIHealthStatus } from "@/services/system-health/metrics";
import type { AIHealth } from "@/services/system-health/types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1_000;
const PROBE_CACHE_MS = 60_000;
const PROBE_FAILURE_CACHE_MS = 15_000;

interface CachedProbe {
  providerKey: string;
  status: AIHealth["status"];
  message: string;
  checkedAt: number;
  expiresAt: number;
}

let cachedProbe: CachedProbe | null = null;
let pendingProbe: {
  providerKey: string;
  promise: Promise<CachedProbe>;
} | null = null;

const PROBE_ERROR_MESSAGES: Record<AIProviderErrorCode, string> = {
  PROVIDER_NOT_CONFIGURED: "AI 服务配置不完整",
  PROVIDER_UNAUTHORIZED: "AI 服务密钥认证失败",
  PROVIDER_FORBIDDEN: "AI 服务拒绝了探测请求",
  PROVIDER_MODEL_NOT_FOUND: "配置的 AI 模型不可用",
  PROVIDER_RATE_LIMITED: "AI 服务当前请求受限",
  PROVIDER_TIMEOUT: "AI 服务探测超时",
  PROVIDER_HTTP_ERROR: "AI 服务返回错误",
  PROVIDER_EMPTY_RESPONSE: "AI 服务返回空响应",
  PROVIDER_UNREADABLE_RESPONSE: "AI 服务响应无法读取",
  PROVIDER_BAD_RESPONSE: "AI 服务响应格式异常",
  PROVIDER_SCHEMA_INVALID: "AI 服务响应结构不兼容",
  PROVIDER_UNAVAILABLE: "无法连接 AI 服务",
};

function probeFailure(error: unknown) {
  if (!(error instanceof AIProviderRequestError)) {
    return { status: "UNAVAILABLE" as const, message: "AI 服务探测失败" };
  }
  const httpStatus = error.metadata.httpStatus;
  if (httpStatus === 401)
    return { status: "UNAVAILABLE" as const, message: "AI 服务密钥认证失败" };
  if (httpStatus === 403)
    return { status: "UNAVAILABLE" as const, message: "AI 服务拒绝了探测请求" };
  if (httpStatus === 404)
    return {
      status: "UNAVAILABLE" as const,
      message: "AI 接口或配置模型不存在",
    };
  if (httpStatus === 429)
    return { status: "DEGRADED" as const, message: "AI 服务当前请求受限" };
  return {
    status:
      error.code === "PROVIDER_RATE_LIMITED"
        ? ("DEGRADED" as const)
        : ("UNAVAILABLE" as const),
    message: PROBE_ERROR_MESSAGES[error.code],
  };
}

async function probeProvider(
  provider: AIProvider,
  now: Date,
): Promise<CachedProbe> {
  if (provider.name === "mock" || !provider.healthCheck) {
    return {
      providerKey: `${provider.name}:${provider.model}`,
      status: "UNKNOWN",
      message:
        provider.name === "mock"
          ? "本地模拟模式，未检测真实 AI 接口"
          : "当前 AI 提供方不支持实时探测",
      checkedAt: now.getTime(),
      expiresAt: now.getTime() + PROBE_CACHE_MS,
    };
  }

  const providerKey = `${provider.name}:${provider.model}`;
  if (
    cachedProbe?.providerKey === providerKey &&
    cachedProbe.expiresAt > now.getTime()
  )
    return { ...cachedProbe, message: `最近探测：${cachedProbe.message}` };
  if (pendingProbe?.providerKey === providerKey) return pendingProbe.promise;

  const promise = provider
    .healthCheck()
    .then<CachedProbe>(() => ({
      providerKey,
      status: "HEALTHY",
      message: "实时接口探测通过",
      checkedAt: now.getTime(),
      expiresAt: now.getTime() + PROBE_CACHE_MS,
    }))
    .catch<CachedProbe>((error: unknown) => {
      const failure = probeFailure(error);
      return {
        providerKey,
        ...failure,
        checkedAt: now.getTime(),
        expiresAt: now.getTime() + PROBE_FAILURE_CACHE_MS,
      };
    })
    .then((result) => {
      cachedProbe = result;
      return result;
    })
    .finally(() => {
      if (pendingProbe?.promise === promise) pendingProbe = null;
    });
  pendingProbe = { providerKey, promise };
  return promise;
}

export async function checkAIHealth(
  enabled: boolean,
  now = new Date(),
): Promise<AIHealth> {
  if (!enabled) {
    return {
      status: "DISABLED",
      configurationComplete: true,
      probeMessage: "AI 分析已关闭",
      successfulExecutionsLast7Days: 0,
      issueExecutionsLast7Days: 0,
      successRateLast7Days: null,
      lastSuccessAt: null,
      lastIssueAt: null,
    };
  }

  let provider: AIProvider;
  try {
    provider = createAIProvider();
  } catch {
    return {
      status: "UNAVAILABLE",
      configurationComplete: false,
      probeMessage: "AI 服务配置不完整或不受支持",
      successfulExecutionsLast7Days: 0,
      issueExecutionsLast7Days: 0,
      successRateLast7Days: null,
      lastSuccessAt: null,
      lastIssueAt: null,
    };
  }

  const since = new Date(now.getTime() - SEVEN_DAYS_MS);
  const issueStatuses = [AIRecordStatus.FAILED, AIRecordStatus.FALLBACK];
  const [
    analysisSuccesses,
    tutoringSuccesses,
    analysisIssues,
    tutoringIssues,
    latestAnalysisSuccess,
    latestTutoringSuccess,
    latestAnalysisIssue,
    latestTutoringIssue,
    probe,
  ] = await Promise.all([
    prisma.aIAnalysis.count({
      where: { status: AIRecordStatus.SUCCEEDED, createdAt: { gte: since } },
    }),
    prisma.aITutoringRecord.count({
      where: { status: AIRecordStatus.SUCCEEDED, createdAt: { gte: since } },
    }),
    prisma.aIAnalysis.count({
      where: { status: { in: issueStatuses }, createdAt: { gte: since } },
    }),
    prisma.aITutoringRecord.count({
      where: { status: { in: issueStatuses }, createdAt: { gte: since } },
    }),
    prisma.aIAnalysis.findFirst({
      where: { status: AIRecordStatus.SUCCEEDED, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.aITutoringRecord.findFirst({
      where: { status: AIRecordStatus.SUCCEEDED, completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    prisma.aIAnalysis.findFirst({
      where: { status: { in: issueStatuses } },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      select: { completedAt: true, createdAt: true },
    }),
    prisma.aITutoringRecord.findFirst({
      where: { status: { in: issueStatuses } },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      select: { completedAt: true, createdAt: true },
    }),
    probeProvider(provider, now),
  ]);

  const successCount = analysisSuccesses + tutoringSuccesses;
  const issueCount = analysisIssues + tutoringIssues;
  const latestSuccess = [
    latestAnalysisSuccess?.completedAt,
    latestTutoringSuccess?.completedAt,
  ]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];
  const latestIssue = [
    latestAnalysisIssue?.completedAt ?? latestAnalysisIssue?.createdAt,
    latestTutoringIssue?.completedAt ?? latestTutoringIssue?.createdAt,
  ]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0];

  const historicalStatus = deriveAIHealthStatus(successCount, issueCount);
  const status =
    probe.status === "HEALTHY" && issueCount > 0 ? "DEGRADED" : probe.status;
  return {
    status,
    configurationComplete: true,
    probeMessage:
      probe.status === "HEALTHY" && historicalStatus === "DEGRADED"
        ? "实时接口探测通过，近 7 天有失败或降级记录"
        : probe.message,
    successfulExecutionsLast7Days: successCount,
    issueExecutionsLast7Days: issueCount,
    successRateLast7Days: percentage(successCount, successCount + issueCount),
    lastSuccessAt: latestSuccess?.toISOString() ?? null,
    lastIssueAt: latestIssue?.toISOString() ?? null,
  };
}
