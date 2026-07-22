import "server-only";

import {
  AIRecordStatus,
  AssignmentStatus,
  Role,
  UserStatus,
} from "@prisma/client";

import {
  createDashboardDateRange,
  previousDashboardPeriod,
} from "@/services/admin/dashboard/date-range";
import {
  calculatePeriodComparison,
  fillDashboardTrendPoints,
  percentage,
} from "@/services/admin/dashboard/metrics";
import {
  loadAIOverview,
  loadDistributions,
  loadLearningOverview,
  loadRecentAIFailures,
  loadRecentAnalyses,
  loadRecentAssignments,
  loadRecentAuditLogs,
  loadRecentRecommendations,
  loadRecentUsers,
  loadTeachingOverview,
  loadTrendCounts,
  loadUserOverview,
} from "@/services/admin/dashboard/repository";
import {
  dashboardActivityQuerySchema,
  dashboardTrendQuerySchema,
} from "@/services/admin/dashboard/schemas";
import {
  DASHBOARD_TIME_ZONE,
  type DashboardActivities,
  type DashboardActivity,
  type DashboardActivityType,
  type DashboardDistributions,
  type DashboardOverview,
  type DashboardTrends,
} from "@/services/admin/dashboard/types";
import { getSystemConfig } from "@/services/system-config/service";

function countFor<T extends string>(
  rows: Array<{ status: T; _count: { _all: number } }>,
  status: T,
): number {
  return rows.find((row) => row.status === status)?._count._all ?? 0;
}

function statusMap(
  analysisRows: Array<{
    status: AIRecordStatus;
    _count: { _all: number };
  }>,
  tutoringRows: Array<{
    status: AIRecordStatus;
    _count: { _all: number };
  }>,
): Record<AIRecordStatus, number> {
  return Object.fromEntries(
    Object.values(AIRecordStatus).map((status) => [
      status,
      countFor(analysisRows, status) + countFor(tutoringRows, status),
    ]),
  ) as Record<AIRecordStatus, number>;
}

export async function getDashboardOverview(
  now = new Date(),
): Promise<DashboardOverview> {
  const range7 = createDashboardDateRange("7d", now);
  const range30 = createDashboardDateRange("30d", now);
  const previous7 = previousDashboardPeriod(range7);
  const [users, teaching, learning, ai, config] = await Promise.all([
    loadUserOverview({
      current7Start: range7.start,
      current7End: range7.end,
      previous7Start: previous7.start,
      previous7End: previous7.end,
      current30Start: range30.start,
    }),
    loadTeachingOverview(),
    loadLearningOverview({
      current7Start: range7.start,
      current30Start: range30.start,
      end: range7.end,
    }),
    loadAIOverview({ start7: range7.start, end: range7.end }),
    getSystemConfig(),
  ]);

  const byRole = Object.fromEntries(
    Object.values(Role).map((role) => [
      role,
      users.roles.find((row) => row.role === role)?._count._all ?? 0,
    ]),
  ) as Record<Role, number>;
  const byStatus = Object.fromEntries(
    Object.values(UserStatus).map((status) => [
      status,
      users.statuses.find((row) => row.status === status)?._count._all ?? 0,
    ]),
  ) as Record<UserStatus, number>;
  const aiStatuses = statusMap(ai.analysisStatuses, ai.tutoringStatuses);
  const terminalAICount =
    aiStatuses.SUCCEEDED + aiStatuses.FAILED + aiStatuses.FALLBACK;

  return {
    generatedAt: now.toISOString(),
    timeZone: DASHBOARD_TIME_ZONE,
    users: {
      total: users.total,
      byRole,
      byStatus,
      newLast7Days: users.current7,
      newLast30Days: users.current30,
      newUserComparison: calculatePeriodComparison(
        users.current7,
        users.previous7,
      ),
    },
    teaching: {
      classroomTotal: teaching.classroomTotal,
      activeClassroomCount: teaching.activeClassroomCount,
      questionTotal: teaching.questionTotal,
      draftAssignmentCount: countFor(
        teaching.assignmentStatuses,
        AssignmentStatus.DRAFT,
      ),
      publishedAssignmentCount: countFor(
        teaching.assignmentStatuses,
        AssignmentStatus.PUBLISHED,
      ),
      closedAssignmentCount: countFor(
        teaching.assignmentStatuses,
        AssignmentStatus.CLOSED,
      ),
      effectiveSubmissionCount: teaching.effectiveSubmissionCount,
      gradedSubmissionCount: teaching.gradedSubmissionCount,
      pendingReviewSubmissionCount: teaching.pendingReviewSubmissionCount,
    },
    learning: {
      ...learning,
      averageGradedPercentage:
        learning.averageGradedPercentage === null
          ? null
          : Math.round(learning.averageGradedPercentage * 100) / 100,
    },
    ai: {
      executionRecordCount:
        ai.analysisStatuses.reduce((sum, row) => sum + row._count._all, 0) +
        ai.tutoringStatuses.reduce((sum, row) => sum + row._count._all, 0),
      analysisRecordCount: ai.analysisRecordCount,
      recommendationRecordCount: ai.recommendationRecordCount,
      executionsLast7Days: ai.recentCount,
      succeededCount: aiStatuses.SUCCEEDED,
      failedCount: aiStatuses.FAILED,
      fallbackCount: aiStatuses.FALLBACK,
      pendingCount: aiStatuses.PENDING,
      successRate: percentage(aiStatuses.SUCCEEDED, terminalAICount),
      averageLatencyMs:
        ai.latencyCount === 0
          ? null
          : Math.round(ai.latencySum / ai.latencyCount),
    },
    config: {
      platformName: config.platformName,
      maintenanceMode: config.maintenanceMode,
      aiAnalysisEnabled: config.aiAnalysisEnabled,
    },
  };
}

export async function getDashboardTrends(
  rawQuery: unknown,
  now = new Date(),
): Promise<DashboardTrends> {
  const query = dashboardTrendQuerySchema.parse(rawQuery);
  const range = createDashboardDateRange(query.range, now);
  const raw = await loadTrendCounts(range.start, range.end);
  const points = fillDashboardTrendPoints(range.dateKeys, raw);
  return {
    range: query.range,
    startDate: range.startDate,
    endDate: range.endDate,
    timeZone: DASHBOARD_TIME_ZONE,
    points,
  };
}

export async function getDashboardDistributions(
  now = new Date(),
): Promise<DashboardDistributions> {
  const raw = await loadDistributions();
  return {
    generatedAt: now.toISOString(),
    roles: raw.roles.map((row) => ({
      key: row.role,
      count: row._count._all,
    })),
    userStatuses: raw.userStatuses.map((row) => ({
      key: row.status,
      count: row._count._all,
    })),
    questionTypes: raw.questionTypes.map((row) => ({
      key: row.type,
      count: row._count._all,
    })),
    questionDifficulties: raw.questionDifficulties.map((row) => ({
      key: row.difficulty,
      count: row._count._all,
    })),
    assignmentStatuses: raw.assignmentStatuses.map((row) => ({
      key: row.status,
      count: row._count._all,
    })),
    submissionStatuses: raw.submissionStatuses.map((row) => ({
      key: row.status,
      count: row._count._all,
    })),
    recommendationStatuses: raw.recommendationStatuses.map((row) => ({
      key: row.status,
      count: row._count._all,
    })),
    recommendationSources: raw.recommendationSources.map((row) => ({
      key: row.source,
      count: row._count._all,
    })),
    knowledgePointCoverage: raw.knowledgePointCoverage.map((row) => ({
      id: row.id,
      name: row.name,
      questionCount: Number(row.questionCount),
    })),
  };
}

const ACTIVITY_LOADERS: Record<
  Exclude<DashboardActivityType, "ALL">,
  (limit: number) => Promise<DashboardActivity[]>
> = {
  USER_CREATED: loadRecentUsers,
  ASSIGNMENT_PUBLISHED: loadRecentAssignments,
  ANALYSIS_GENERATED: loadRecentAnalyses,
  RECOMMENDATION_GENERATED: loadRecentRecommendations,
  ADMIN_AUDIT: loadRecentAuditLogs,
  AI_FAILURE: loadRecentAIFailures,
};

export async function getDashboardActivities(
  rawQuery: unknown,
): Promise<DashboardActivities> {
  const query = dashboardActivityQuerySchema.parse(rawQuery);
  const activities =
    query.type === "ALL"
      ? (
          await Promise.all(
            Object.values(ACTIVITY_LOADERS).map((loader) =>
              loader(query.limit),
            ),
          )
        ).flat()
      : await ACTIVITY_LOADERS[query.type](query.limit);
  return {
    items: activities
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, query.limit),
    limit: query.limit,
  };
}
