"use client";

import { RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { ActivityPanel } from "@/components/admin/dashboard/activity-panel";
import { useAdminDashboardCache } from "@/components/admin/dashboard/admin-dashboard-cache";
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
function cachedState<T>(data: T | null): SectionState<T> {
  return { data, error: null, loading: data === null };
}

async function loadSection<T>(
  url: string,
  setter: Dispatch<SetStateAction<SectionState<T>>>,
  signal?: AbortSignal,
): Promise<T | null> {
  setter((current) => ({ ...current, loading: true, error: null }));
  const result = await requestAdminApi<T>(url, { cache: "no-store", signal });
  if (signal?.aborted) return null;
  if (result.success) {
    setter({ data: result.data, error: null, loading: false });
    return result.data;
  } else {
    setter((current) => ({ ...current, error: result.error, loading: false }));
    return null;
  }
}

export function AdminDashboard() {
  const { snapshot, updateSnapshot } = useAdminDashboardCache();
  const hasStartedInitialLoad = useRef(false);
  const [range, setRange] = useState<DashboardRange>("30d");
  const [overview, setOverview] = useState<SectionState<DashboardOverview>>(
    () => cachedState(snapshot?.overview ?? null),
  );
  const [trends, setTrends] = useState<SectionState<DashboardTrends>>(() => {
    return cachedState(snapshot?.trends["30d"] ?? null);
  });
  const [distributions, setDistributions] = useState<
    SectionState<DashboardDistributions>
  >(() => cachedState(snapshot?.distributions ?? null));
  const [activities, setActivities] = useState<
    SectionState<DashboardActivities>
  >(() => cachedState(snapshot?.activities ?? null));

  const loadCore = useCallback(
    async (signal?: AbortSignal) => {
      const [overviewData, distributionsData, activitiesData] =
        await Promise.all([
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
      updateSnapshot((previous) => ({
        overview: overviewData ?? previous?.overview ?? null,
        distributions: distributionsData ?? previous?.distributions ?? null,
        activities: activitiesData ?? previous?.activities ?? null,
        trends: previous?.trends ?? {},
      }));
    },
    [updateSnapshot],
  );
  const loadTrends = useCallback(
    async (signal?: AbortSignal) => {
      const data = await loadSection(
        `/api/admin/dashboard/trends?range=${range}`,
        setTrends,
        signal,
      );
      if (!data) return;
      updateSnapshot((previous) => ({
        overview: previous?.overview ?? null,
        distributions: previous?.distributions ?? null,
        activities: previous?.activities ?? null,
        trends: { ...previous?.trends, [range]: data },
      }));
    },
    [range, updateSnapshot],
  );

  const hasCoreCache = Boolean(
    snapshot?.overview && snapshot.distributions && snapshot.activities,
  );
  useEffect(() => {
    if (hasCoreCache || hasStartedInitialLoad.current) return;
    hasStartedInitialLoad.current = true;
    const controller = new AbortController();
    void loadCore(controller.signal);
    return () => controller.abort();
  }, [hasCoreCache, loadCore]);
  useEffect(() => {
    const cached = snapshot?.trends[range];
    if (cached) {
      setTrends(cachedState(cached));
      return;
    }
    const controller = new AbortController();
    void loadTrends(controller.signal);
    return () => controller.abort();
  }, [loadTrends, range, snapshot?.trends]);

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
        description="查看本校用户、教学、题库与 AI 使用情况。数据仅在首次进入和点击“刷新数据”时更新。"
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
