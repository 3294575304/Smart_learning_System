import type {
  PeriodComparison,
  TrendPoint,
} from "@/services/admin/dashboard/types";

export function calculatePeriodComparison(
  current: number,
  previous: number,
): PeriodComparison {
  const difference = current - previous;
  if (previous === 0) {
    return {
      current,
      previous,
      difference,
      percentage: null,
      kind: current === 0 ? "NO_CHANGE" : "NEW",
    };
  }
  return {
    current,
    previous,
    difference,
    percentage: Math.round((difference / previous) * 10_000) / 100,
    kind: "PERCENTAGE",
  };
}

export function percentage(part: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((part / total) * 10_000) / 100;
}

interface TrendCountRow {
  date: string;
  count: number | bigint;
}

export interface RawTrendCounts {
  users: TrendCountRow[];
  assignments: TrendCountRow[];
  submissions: TrendCountRow[];
  answers: TrendCountRow[];
  analyses: TrendCountRow[];
  recommendations: TrendCountRow[];
}

function trendCountMap(rows: TrendCountRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.date, Number(row.count)]));
}

export function fillDashboardTrendPoints(
  dateKeys: string[],
  raw: RawTrendCounts,
): TrendPoint[] {
  const maps = {
    users: trendCountMap(raw.users),
    assignments: trendCountMap(raw.assignments),
    submissions: trendCountMap(raw.submissions),
    answers: trendCountMap(raw.answers),
    analyses: trendCountMap(raw.analyses),
    recommendations: trendCountMap(raw.recommendations),
  };
  return dateKeys.map((date) => ({
    date,
    users: maps.users.get(date) ?? 0,
    assignments: maps.assignments.get(date) ?? 0,
    submissions: maps.submissions.get(date) ?? 0,
    answers: maps.answers.get(date) ?? 0,
    analyses: maps.analyses.get(date) ?? 0,
    recommendations: maps.recommendations.get(date) ?? 0,
  }));
}
