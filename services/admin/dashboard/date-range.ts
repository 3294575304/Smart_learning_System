import type { DashboardRange } from "@/services/admin/dashboard/types";

const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

const RANGE_DAYS: Record<DashboardRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export interface DashboardDateRange {
  days: number;
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  dateKeys: string[];
}

function shanghaiDateKey(value: Date): string {
  return new Date(value.getTime() + SHANGHAI_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function shanghaiDayStart(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - SHANGHAI_UTC_OFFSET_MS);
}

/**
 * Builds a half-open [start, end) range using Asia/Shanghai calendar days.
 * The supported 90-day window is in the modern UTC+08:00 period without DST.
 */
export function createDashboardDateRange(
  range: DashboardRange,
  now = new Date(),
): DashboardDateRange {
  const days = RANGE_DAYS[range];
  const todayStart = shanghaiDayStart(shanghaiDateKey(now));
  const end = new Date(todayStart.getTime() + DAY_MS);
  const start = new Date(end.getTime() - days * DAY_MS);
  const dateKeys = Array.from({ length: days }, (_, index) =>
    shanghaiDateKey(new Date(start.getTime() + index * DAY_MS)),
  );
  return {
    days,
    start,
    end,
    startDate: dateKeys[0],
    endDate: dateKeys.at(-1) ?? dateKeys[0],
    dateKeys,
  };
}

export function previousDashboardPeriod(current: DashboardDateRange): {
  start: Date;
  end: Date;
} {
  return {
    start: new Date(current.start.getTime() - current.days * DAY_MS),
    end: current.start,
  };
}
