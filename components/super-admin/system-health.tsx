"use client";

import { useEffect, useState } from "react";

import { HealthPanel } from "@/components/admin/dashboard/health-panel";
import { requestAdminApi } from "@/components/admin/request-api";
import type { SystemHealthResult } from "@/services/system-health/types";

interface SectionState {
  data: SystemHealthResult | null;
  error: string | null;
  loading: boolean;
}

const initialState: SectionState = {
  data: null,
  error: null,
  loading: true,
};

export function SuperAdminSystemHealth({ refreshKey }: { refreshKey: string }) {
  const [state, setState] = useState(initialState);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void requestAdminApi<SystemHealthResult>("/api/admin/system-health", {
      cache: "no-store",
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.success) {
        setState({ data: result.data, error: null, loading: false });
      } else {
        setState((current) => ({
          ...current,
          error: result.error,
          loading: false,
        }));
      }
    });
    return () => controller.abort();
  }, [refreshCount, refreshKey]);

  return (
    <HealthPanel
      data={state.data}
      error={state.error}
      loading={state.loading}
      onRefresh={() => {
        setState((current) => ({ ...current, error: null, loading: true }));
        setRefreshCount((count) => count + 1);
      }}
    />
  );
}
