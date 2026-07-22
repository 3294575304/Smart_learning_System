import {
  Bot,
  CheckCircle2,
  CircleHelp,
  Database,
  Settings,
  TriangleAlert,
} from "lucide-react";

import {
  DashboardPanel,
  SectionError,
  SectionLoading,
} from "@/components/admin/dashboard/section-state";
import type {
  SystemHealthResult,
  SystemHealthStatus,
} from "@/services/system-health/types";

const STATUS_LABELS: Record<SystemHealthStatus, string> = {
  HEALTHY: "健康",
  DEGRADED: "降级",
  UNAVAILABLE: "不可用",
  DISABLED: "已关闭",
  UNKNOWN: "未知",
};

function statusClass(status: SystemHealthStatus): string {
  if (status === "HEALTHY")
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "DEGRADED")
    return "bg-amber-50 text-amber-800 border-amber-200";
  if (status === "UNAVAILABLE") return "bg-red-50 text-red-800 border-red-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

function StatusBadge({ status }: { status: SystemHealthStatus }) {
  const Icon =
    status === "HEALTHY"
      ? CheckCircle2
      : status === "UNKNOWN" || status === "DISABLED"
        ? CircleHelp
        : TriangleAlert;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${statusClass(status)}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function HealthPanel({
  data,
  error,
  loading,
}: {
  data: SystemHealthResult | null;
  error: string | null;
  loading: boolean;
}) {
  return (
    <DashboardPanel
      description="轻量检查数据库、AI 配置与关键数据状态，不会主动调用付费 AI 服务。"
      title="系统运行状态"
    >
      {loading && !data ? (
        <SectionLoading label="正在检查系统状态" />
      ) : error && !data ? (
        <SectionError message={error} />
      ) : data ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <span className="flex items-center gap-3 text-sm font-medium">
              <Database aria-hidden="true" className="h-4 w-4" />
              数据库
            </span>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs">
                {data.database.responseTimeMs === null
                  ? "未取得耗时"
                  : `${data.database.responseTimeMs} ms`}
              </span>
              <StatusBadge status={data.database.status} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <span className="flex items-center gap-3 text-sm font-medium">
              <Bot aria-hidden="true" className="h-4 w-4" />
              AI 服务
            </span>
            <div className="text-right">
              <StatusBadge status={data.ai.status} />
              <p className="text-muted-foreground mt-1 text-xs">
                近 7 天成功 {data.ai.successfulExecutionsLast7Days} · 问题/降级{" "}
                {data.ai.issueExecutionsLast7Days}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <span className="flex items-center gap-3 text-sm font-medium">
              <Settings aria-hidden="true" className="h-4 w-4" />
              维护模式
            </span>
            <StatusBadge
              status={data.config.maintenanceMode ? "DEGRADED" : "HEALTHY"}
            />
          </div>
          <div className="text-muted-foreground flex flex-wrap justify-between gap-2 text-xs">
            <span>
              可用管理员：{data.data.activeAdminAvailable ? "存在" : "缺失"}
              ；超时 AI 任务：{data.data.stalePendingAITaskCount}
            </span>
            <span>
              检查于{" "}
              {new Date(data.checkedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </span>
          </div>
        </div>
      ) : null}
      {error && data ? (
        <p className="mt-3 text-xs text-amber-700">
          重新检查失败，当前显示上一次成功结果。
        </p>
      ) : null}
    </DashboardPanel>
  );
}
