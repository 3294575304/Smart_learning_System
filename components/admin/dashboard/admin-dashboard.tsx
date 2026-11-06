"use client";

import { RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { ActivityPanel } from "@/components/admin/dashboard/activity-panel";
import { DistributionPanel } from "@/components/admin/dashboard/distribution-panel";
import { OverviewPanel } from "@/components/admin/dashboard/overview-panel";
import { TrendPanel } from "@/components/admin/dashboard/trend-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { requestAdminApi } from "@/components/admin/request-api";
import type {
  DashboardActivities,
  DashboardDistributions,
  DashboardOverview,
  DashboardRange,
  DashboardTrends,
} from "@/services/admin/dashboard/types";

interface SectionState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}
const initialState = <T,>(): SectionState<T> => ({
  data: null,
  error: null,
  loading: true,
});

async function loadSection<T>(
  url: string,
  setter: Dispatch<SetStateAction<SectionState<T>>>,
  signal?: AbortSignal,
): Promise<void> {
  setter((current) => ({ ...current, loading: true, error: null }));
  const result = await requestAdminApi<T>(url, { cache: "no-store", signal });
  if (signal?.aborted) return;
  if (result.success)
    setter({ data: result.data, error: null, loading: false });
  else
    setter((current) => ({ ...current, error: result.error, loading: false }));
}

export function AdminDashboard() {
  const [range, setRange] = useState<DashboardRange>("30d");
  const [overview, setOverview] =
    useState<SectionState<DashboardOverview>>(initialState);
  const [trends, setTrends] =
    useState<SectionState<DashboardTrends>>(initialState);
  const [distributions, setDistributions] =
    useState<SectionState<DashboardDistributions>>(initialState);
  const [activities, setActivities] =
    useState<SectionState<DashboardActivities>>(initialState);

  const loadCore = useCallback(async (signal?: AbortSignal) => {
    await Promise.allSettled([
      loadSection("/api/admin/dashboard/overview", setOverview, signal),
      loadSection(
        "/api/admin/dashboard/distributions",
        setDistributions,
        signal,
      ),
      loadSection(
        "/api/admin/dashboard/activities?limit=5&type=ALL",
        setActivities,
        signal,
      ),
    ]);
  }, []);
  const loadTrends = useCallback(
    (signal?: AbortSignal) =>
      loadSection(
        `/api/admin/dashboard/trends?range=${range}`,
        setTrends,
        signal,
      ),
    [range],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadCore(controller.signal);
    return () => controller.abort();
  }, [loadCore]);
  useEffect(() => {
    const controller = new AbortController();
    void loadTrends(controller.signal);
    return () => controller.abort();
  }, [loadTrends]);

  const refreshing =
    overview.loading ||
    trends.loading ||
    distributions.loading ||
    activities.loading;
  const refresh = () => {
    void Promise.allSettled([loadCore(), loadTrends()]);
  };

  return (
    <section className="space-y-7">
      <PageHeader
        actions={
          <button
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-sky-50/70 disabled:cursor-wait disabled:opacity-60"
            disabled={refreshing}
            onClick={refresh}
            type="button"
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            刷新数据
          </button>
        }
        description="查看本校用户、教学、题库与 AI 使用情况。"
        eyebrow="Admin dashboard"
        title="学校仪表盘"
      />
      <OverviewPanel
        data={overview.data}
        error={overview.error}
        loading={overview.loading}
      />
      <TrendPanel
        data={trends.data}
        error={trends.error}
        loading={trends.loading}
        onRangeChange={setRange}
        range={range}
      />
      <div className="grid items-stretch gap-6 xl:grid-cols-2">
        <DistributionPanel
          data={distributions.data}
          error={distributions.error}
          loading={distributions.loading}
        />
        <ActivityPanel
          data={activities.data}
          error={activities.error}
          loading={activities.loading}
        />
      </div>
    </section>
  );
}
