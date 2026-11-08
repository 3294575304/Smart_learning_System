import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DistributionPanel } from "@/components/admin/dashboard/distribution-panel";
import { OverviewPanel } from "@/components/admin/dashboard/overview-panel";
import { TrendPanel } from "@/components/admin/dashboard/trend-panel";
import {
  createDashboardDateRange,
  previousDashboardPeriod,
} from "@/services/admin/dashboard/date-range";
import {
  calculatePeriodComparison,
  fillDashboardTrendPoints,
} from "@/services/admin/dashboard/metrics";
import {
  dashboardActivityQuerySchema,
  dashboardTrendQuerySchema,
} from "@/services/admin/dashboard/schemas";
import type {
  DashboardDistributions,
  DashboardOverview,
  DashboardRange,
  DashboardTrends,
} from "@/services/admin/dashboard/types";
import {
  deriveAIHealthStatus,
  deriveOverallHealthStatus,
} from "@/services/system-health/metrics";

// The repository keeps JSX in preserve mode for Next.js; the standalone tsx
// test runner therefore needs the classic JSX runtime exposed for rendering.
Object.assign(globalThis, { React });

test("7 天、30 天和 90 天范围使用上海日历日且结束边界互斥", () => {
  const now = new Date("2026-07-22T15:59:59.000Z");
  const range7 = createDashboardDateRange("7d", now);
  assert.equal(range7.dateKeys.length, 7);
  assert.equal(range7.startDate, "2026-07-16");
  assert.equal(range7.endDate, "2026-07-22");
  assert.equal(range7.start.toISOString(), "2026-07-15T16:00:00.000Z");
  assert.equal(range7.end.toISOString(), "2026-07-22T16:00:00.000Z");
  assert.equal(createDashboardDateRange("30d", now).dateKeys.length, 30);
  assert.equal(createDashboardDateRange("90d", now).dateKeys.length, 90);
});

test("上海午夜边界不会把新一天的数据归入前一天", () => {
  const range = createDashboardDateRange(
    "7d",
    new Date("2026-07-22T16:00:00.000Z"),
  );
  assert.equal(range.startDate, "2026-07-17");
  assert.equal(range.endDate, "2026-07-23");
  const previous = previousDashboardPeriod(range);
  assert.equal(previous.end.toISOString(), range.start.toISOString());
});

test("趋势补齐无数据日期为 0 并保持日期升序", () => {
  const points = fillDashboardTrendPoints(
    ["2026-07-20", "2026-07-21", "2026-07-22"],
    {
      users: [{ date: "2026-07-21", count: BigInt(2) }],
      assignments: [],
      submissions: [{ date: "2026-07-22", count: BigInt(3) }],
      answers: [],
      analyses: [],
      recommendations: [],
    },
  );
  assert.deepEqual(
    points.map((point) => point.date),
    ["2026-07-20", "2026-07-21", "2026-07-22"],
  );
  assert.equal(points[0].users, 0);
  assert.equal(points[1].users, 2);
  assert.equal(points[2].submissions, 3);
  assert.equal(points[2].answers, 0);
});

test("增长率正确处理增长、下降和上一周期为零", () => {
  assert.deepEqual(calculatePeriodComparison(15, 10), {
    current: 15,
    previous: 10,
    difference: 5,
    percentage: 50,
    kind: "PERCENTAGE",
  });
  assert.equal(calculatePeriodComparison(5, 10).percentage, -50);
  assert.deepEqual(calculatePeriodComparison(3, 0), {
    current: 3,
    previous: 0,
    difference: 3,
    percentage: null,
    kind: "NEW",
  });
  assert.equal(calculatePeriodComparison(0, 0).kind, "NO_CHANGE");
});

test("趋势和动态查询拒绝非法范围、未知字段和过大 limit", () => {
  assert.equal(dashboardTrendQuerySchema.parse({}).range, "30d");
  assert.equal(
    dashboardTrendQuerySchema.safeParse({ range: "365d" }).success,
    false,
  );
  assert.equal(
    dashboardTrendQuerySchema.safeParse({ range: "7d", metric: "secret" })
      .success,
    false,
  );
  assert.equal(
    dashboardActivityQuerySchema.safeParse({ limit: 21 }).success,
    false,
  );
});

test("AI 无记录为 UNKNOWN，关闭和异常状态不伪造健康", () => {
  assert.equal(deriveAIHealthStatus(0, 0), "UNKNOWN");
  assert.equal(deriveAIHealthStatus(0, 2), "UNAVAILABLE");
  assert.equal(deriveAIHealthStatus(3, 1), "DEGRADED");
  assert.equal(deriveAIHealthStatus(3, 0), "HEALTHY");
  assert.equal(
    deriveOverallHealthStatus({
      database: "HEALTHY",
      ai: "DISABLED",
      sandbox: "DISABLED",
      activeAdminAvailable: true,
      stalePendingAITaskCount: 0,
    }),
    "HEALTHY",
  );
});

const overviewFixture: DashboardOverview = {
  generatedAt: "2026-07-22T08:00:00.000Z",
  timeZone: "Asia/Shanghai",
  users: {
    total: 12,
    byRole: { SUPER_ADMIN: 0, ADMIN: 1, TEACHER: 3, STUDENT: 8 },
    byStatus: { ACTIVE: 11, INACTIVE: 1 },
    newLast7Days: 2,
    newLast30Days: 5,
    newUserComparison: {
      current: 2,
      previous: 1,
      difference: 1,
      percentage: 100,
      kind: "PERCENTAGE",
    },
  },
  teaching: {
    classroomTotal: 4,
    activeClassroomCount: 3,
    questionTotal: 25,
    draftAssignmentCount: 2,
    publishedAssignmentCount: 6,
    closedAssignmentCount: 1,
    effectiveSubmissionCount: 18,
    gradedSubmissionCount: 16,
    pendingReviewSubmissionCount: 2,
  },
  learning: {
    finalizedSubmissionCount: 16,
    averageGradedPercentage: 82.5,
    answersLast7Days: 20,
    answersLast30Days: 40,
    incorrectAnswerCount: 7,
    generatedAnalysisCount: 5,
    generatedRecommendationCount: 9,
  },
  ai: {
    executionRecordCount: 6,
    analysisRecordCount: 5,
    recommendationRecordCount: 9,
    executionsLast7Days: 2,
    succeededCount: 4,
    failedCount: 1,
    fallbackCount: 1,
    pendingCount: 0,
    successRate: 66.67,
    averageLatencyMs: 320,
  },
  config: {
    platformName: "智学课堂",
    maintenanceMode: false,
    aiAnalysisEnabled: true,
  },
};

test("指标卡片展示真实传入值和明确统计口径", () => {
  const html = renderToStaticMarkup(
    React.createElement(OverviewPanel, {
      data: overviewFixture,
      error: null,
      loading: false,
    }),
  );
  assert.match(html, /用户总数/);
  assert.match(html, />12</);
  assert.match(html, /排除已软删除题目/);
  assert.match(html, /82\.5%/);
  assert.doesNotMatch(html, /passwordHash|AI_API_KEY|DATABASE_URL/);
});

test("分布页面只渲染接口返回的实际类别", () => {
  const data: DashboardDistributions = {
    generatedAt: "2026-07-22T08:00:00.000Z",
    roles: [{ key: "ADMIN", count: 1 }],
    userStatuses: [],
    questionTypes: [],
    questionObjectives: [],
    assignmentStatuses: [{ key: "DRAFT", count: 2 }],
    submissionStatuses: [],
    recommendationStatuses: [],
    recommendationSources: [],
    knowledgePointCoverage: [],
  };
  const html = renderToStaticMarkup(
    React.createElement(DistributionPanel, {
      data,
      error: null,
      loading: false,
    }),
  );
  assert.match(html, /管理员/);
  assert.match(html, /草稿/);
  assert.doesNotMatch(html, /教师/);
  assert.doesNotMatch(html, /已发布/);
});

function trendFixture(range: DashboardRange): DashboardTrends {
  const points = Array.from(
    { length: Number.parseInt(range, 10) },
    (_, index) => ({
      date: new Date(Date.UTC(2026, 6, index + 1)).toISOString().slice(0, 10),
      users: index === 0 ? 1 : 0,
      assignments: index === 1 ? 6 : 0,
      submissions: index === 2 ? 2 : 0,
      answers: index === 2 ? 36 : 0,
      analyses: 0,
      recommendations: 0,
    }),
  );
  return {
    range,
    startDate: points[0].date,
    endDate: points[points.length - 1].date,
    timeZone: "Asia/Shanghai",
    points,
  };
}

test("7、30、90 天趋势保持真实柱高，零值不生成占位柱且无需固定宽度滚动", () => {
  for (const range of ["7d", "30d", "90d"] as const) {
    const data = trendFixture(range);
    const html = renderToStaticMarkup(
      React.createElement(TrendPanel, {
        data,
        range,
        error: null,
        loading: false,
        onRangeChange: () => {},
      }),
    );
    assert.equal((html.match(/<svg /gu) ?? []).length, 2);
    assert.equal((html.match(/<rect [^>]*fill="#/gu) ?? []).length, 4);
    assert.match(html, /2026-07-02 · 发布作业：6/);
    assert.match(html, /2026-07-03 · 答题记录：36/);
    assert.match(html, new RegExp(data.endDate));
    assert.match(html, /使用左右方向键查看每日数据/);
    assert.doesNotMatch(
      html,
      /NaN|Infinity|overflow-x-auto|min-width|width:640px/,
    );
  }
});

test("趋势完整区分加载、失败、无活动和刷新失败的历史数据", () => {
  const render = (
    data: DashboardTrends | null,
    loading: boolean,
    error: string | null,
  ) =>
    renderToStaticMarkup(
      React.createElement(TrendPanel, {
        data,
        loading,
        error,
        range: "7d",
        onRangeChange: () => {},
      }),
    );
  assert.match(render(null, true, null), /正在读取趋势数据/);
  assert.match(render(null, false, "读取失败"), /读取失败/);
  const empty = trendFixture("7d");
  empty.points = empty.points.map((point) => ({
    ...point,
    users: 0,
    assignments: 0,
    submissions: 0,
    answers: 0,
  }));
  assert.match(render(empty, false, null), /当前时间范围内暂无/);
  const html = render(trendFixture("7d"), false, "读取失败");
  assert.match(html, /上一次成功数据/);
  assert.match(html, /2026-07-03 · 答题记录：36/);
});

test("角色与作业环形图按总数计算占比，缺失分组明确为空", () => {
  const data: DashboardDistributions = {
    generatedAt: "2026-07-22T08:00:00.000Z",
    roles: [
      { key: "STUDENT", count: 105 },
      { key: "TEACHER", count: 3 },
      { key: "ADMIN", count: 2 },
    ],
    assignmentStatuses: [
      { key: "ARCHIVED", count: 4 },
      { key: "PUBLISHED", count: 18 },
    ],
    userStatuses: [],
    questionTypes: [],
    questionObjectives: [],
    submissionStatuses: [],
    recommendationStatuses: [],
    recommendationSources: [],
    knowledgePointCoverage: [],
  };
  const render = () =>
    renderToStaticMarkup(
      React.createElement(DistributionPanel, {
        data,
        loading: false,
        error: null,
      }),
    );
  const html = render();
  assert.match(html, /合计 110人/);
  assert.match(html, /学生 105人，占 95\.45%/);
  assert.match(html, /已发布 18份，占 81\.82%/);
  const lengths = [...html.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/gu)];
  assert.equal(lengths.length, 5);
  assert.ok(
    Math.abs(Number(lengths[0][1]) / Number(lengths[0][2]) - 105 / 110) < 1e-10,
  );
  assert.doesNotMatch(html, /稳定枚举|数据库|NaN|Infinity/);
  data.roles = [];
  assert.match(render(), /暂无用户角色数据/);
  data.roles = [{ key: "STUDENT", count: 0 }];
  assert.doesNotMatch(render(), /NaN|Infinity/);
  assert.match(render(), /暂无用户角色数据/);
});
