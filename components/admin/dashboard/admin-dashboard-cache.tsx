"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import type {
  DashboardActivities,
  DashboardDistributions,
  DashboardOverview,
  DashboardRange,
  DashboardTrends,
} from "@/services/admin/dashboard/types";

export interface AdminDashboardSnapshot {
  overview: DashboardOverview | null;
  distributions: DashboardDistributions | null;
  activities: DashboardActivities | null;
  trends: Partial<Record<DashboardRange, DashboardTrends>>;
}

interface AdminDashboardCacheValue {
  snapshot: AdminDashboardSnapshot | null;
  updateSnapshot: (
    update: (current: AdminDashboardSnapshot | null) => AdminDashboardSnapshot,
  ) => void;
}

const AdminDashboardCacheContext =
  createContext<AdminDashboardCacheValue | null>(null);

export function AdminDashboardCacheProvider({
  scopeKey,
  children,
}: {
  scopeKey: string;
  children: ReactNode;
}) {
  const [stored, setStored] = useState<{
    scopeKey: string;
    snapshot: AdminDashboardSnapshot;
  } | null>(null);
  const updateSnapshot = useCallback(
    (
      update: (
        current: AdminDashboardSnapshot | null,
      ) => AdminDashboardSnapshot,
    ) => {
      setStored((current) => ({
        scopeKey,
        snapshot: update(
          current?.scopeKey === scopeKey ? current.snapshot : null,
        ),
      }));
    },
    [scopeKey],
  );
  const value = {
    snapshot: stored?.scopeKey === scopeKey ? stored.snapshot : null,
    updateSnapshot,
  };

  return (
    <AdminDashboardCacheContext.Provider value={value}>
      {children}
    </AdminDashboardCacheContext.Provider>
  );
}

export function useAdminDashboardCache(): AdminDashboardCacheValue {
  const value = useContext(AdminDashboardCacheContext);
  if (!value)
    throw new Error("Admin dashboard cache requires its layout provider");
  return value;
}
