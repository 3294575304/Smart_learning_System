import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AIProviderRequestError, type AIProviderResponse } from "./provider";

export type AICapability =
  | "assignment_suggestion"
  | "quality_report"
  | "question_generation"
  | "paper_parse"
  | "syllabus_parse"
  | "graph_enhance"
  | "question_mapping"
  | "objective_classify"
  | "student_analysis"
  | "learning_assistant"
  | "teacher_evaluation_intent"
  | "recommend_explain"
  | "self_reflection";

export interface AIRequestScope {
  capability: AICapability;
  actorId: string;
  /** Stable, server-owned ID for durable work. */
  requestId?: string;
  units?: number;
}

export function aiQuotaMode() {
  const value = process.env.AI_QUOTA_MODE;
  return value === "enforce" || value === "off" ? value : "shadow";
}

const dayMs = 86_400_000;
const chinaOffsetMs = 8 * 3_600_000;

export async function reserveAIQuota(
  scope: AIRequestScope,
  key: string,
  schoolId: string | null,
  mode: "shadow" | "enforce",
) {
  const units = scope.units ?? 1;
  if (!Number.isSafeInteger(units) || units < 1)
    throw new Error("Invalid AI quota units");
  return prisma.$transaction(async (tx) => {
    // Serialize all requests sharing an actor or a school before reading their usage.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"ai:actor:" + scope.actorId + ":" + scope.capability}, 0))`;
    if (schoolId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"ai:school:" + schoolId + ":" + scope.capability}, 0))`;
    const existing = await tx.aIQuotaReservation.findUnique({ where: { key } });
    if (existing)
      return { accepted: true, wouldLimit: false, schoolId: existing.schoolId };

    const now = Date.now();
    const day = new Date(
      Math.floor((now + chinaOffsetMs) / dayMs) * dayMs - chinaOffsetMs,
    );
    const actor = { actorId: scope.actorId, capability: scope.capability };
    const perMinute = scope.capability === "question_generation" ? 2 : 6;
    const perActor = scope.capability === "question_generation" ? 400 : 100;
    const perSchool =
      scope.capability === "question_generation" ? 4_000 : 2_000;
    const recent = await tx.aIQuotaReservation.count({
      where: { ...actor, createdAt: { gt: new Date(now - 60_000) } },
    });
    const daily = await tx.aIQuotaReservation.aggregate({
      where: { ...actor, createdAt: { gte: day } },
      _sum: { units: true },
    });
    const school = schoolId
      ? await tx.aIQuotaReservation.aggregate({
          where: {
            schoolId,
            capability: scope.capability,
            createdAt: { gte: day },
          },
          _sum: { units: true },
        })
      : null;
    const wouldLimit =
      recent >= perMinute ||
      (daily._sum.units ?? 0) + units > perActor ||
      (!!school && (school._sum.units ?? 0) + units > perSchool);
    if (wouldLimit && mode === "enforce")
      return { accepted: false, wouldLimit, schoolId };
    await tx.aIQuotaReservation.create({
      data: { key, ...actor, schoolId, units, createdAt: new Date(now) },
    });
    return { accepted: true, wouldLimit, schoolId };
  });
}

export function createAIAttemptRunner(scope: AIRequestScope, model: string) {
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        scope.actorId,
        scope.capability,
        scope.requestId ?? randomUUID(),
      ]),
    )
    .digest("hex");
  return async (
    signal: AbortSignal,
    operation: string,
    invoke: () => Promise<AIProviderResponse>,
  ) => {
    signal.throwIfAborted();
    if (process.env.AI_EXTERNAL_CALLS_DISABLED === "true")
      throw new AIProviderRequestError(
        "AI 外部调用已暂停",
        "PROVIDER_UNAVAILABLE",
      );
    const mode = aiQuotaMode();
    if (mode === "off") return invoke();

    let schoolId: string | null = null;
    let wouldLimit = false;
    try {
      const actor = await prisma.user.findUniqueOrThrow({
        where: { id: scope.actorId },
        select: { schoolId: true },
      });
      schoolId = actor.schoolId;
      signal.throwIfAborted();
      const admission = await reserveAIQuota(scope, key, schoolId, mode);
      schoolId = admission.schoolId;
      wouldLimit = admission.wouldLimit;
      if (!admission.accepted)
        throw new AIProviderRequestError(
          "AI 请求额度已用完",
          "PROVIDER_LOCAL_QUOTA_EXCEEDED",
        );
    } catch (error) {
      if (signal.aborted) throw error;
      if (mode === "shadow") {
        console.warn("AI shadow quota recording failed", {
          capability: scope.capability,
        });
      } else {
        const rejection =
          error instanceof AIProviderRequestError
            ? error
            : new AIProviderRequestError(
                "AI 额度暂时无法核对",
                "PROVIDER_UNAVAILABLE",
              );
        await recordAttempt({
          schoolId,
          capability: scope.capability,
          requestKey: key,
          operation,
          model,
          outcome: "REJECTED",
          errorCode: rejection.code,
          latencyMs: 0,
          wouldLimit,
        });
        throw rejection;
      }
    }
    signal.throwIfAborted();
    const startedAt = performance.now();
    let response: AIProviderResponse | undefined;
    let failure: unknown;
    try {
      response = await invoke();
      return response;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const providerError =
        failure instanceof AIProviderRequestError ? failure : null;
      await recordAttempt({
        schoolId,
        capability: scope.capability,
        requestKey: key,
        operation,
        model,
        outcome: response ? "RETURNED" : "FAILED",
        errorCode: response
          ? null
          : (providerError?.code ?? "PROVIDER_UNAVAILABLE"),
        requestId: response?.requestId ?? providerError?.requestId ?? null,
        totalTokens: response?.usage.totalTokens ?? null,
        latencyMs: Math.round(performance.now() - startedAt),
        wouldLimit,
      });
    }
  };
}

async function recordAttempt(
  data: Parameters<typeof prisma.aIProviderAttemptLog.create>[0]["data"],
) {
  try {
    await prisma.aIProviderAttemptLog.create({
      data: { ...data, createdAt: new Date() },
    });
  } catch {
    console.warn("AI provider attempt recording failed", {
      capability: data.capability,
    });
  }
}

export async function pruneAIProviderAttemptLogs(now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * dayMs);
  await prisma.$executeRaw`
    DELETE FROM "AIProviderAttemptLog" WHERE id IN (
      SELECT id FROM "AIProviderAttemptLog"
      WHERE "createdAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
      ORDER BY "createdAt" LIMIT 1000
    )
  `;
}
