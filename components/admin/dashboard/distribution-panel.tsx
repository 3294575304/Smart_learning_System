import {
  DashboardPanel,
  SectionEmpty,
  SectionError,
  SectionLoading,
} from "@/components/admin/dashboard/section-state";
import type {
  DashboardDistributions,
  DistributionItem,
} from "@/services/admin/dashboard/types";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "超级管理员",
  ADMIN: "管理员",
  TEACHER: "教师",
  STUDENT: "学生",
};
const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CLOSED: "已关闭",
  COMPLETED: "已结课",
  ARCHIVED: "已归档",
};

const ROLE_COLORS: Record<string, string> = {
  STUDENT: "#0284c7",
  TEACHER: "#0d9488",
  ADMIN: "#d97706",
  SUPER_ADMIN: "#7c3aed",
};
const ASSIGNMENT_STATUS_COLORS: Record<string, string> = {
  DRAFT: "#0284c7",
  PUBLISHED: "#059669",
  CLOSED: "#d97706",
  COMPLETED: "#7c3aed",
  ARCHIVED: "#64748b",
};

function DistributionChart<T extends string | number>({
  items,
  labels,
  colors,
  title,
  unit,
}: {
  items: DistributionItem<T>[];
  labels: Record<string, string>;
  colors: Record<string, string>;
  title: string;
  unit: string;
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const circumference = 2 * Math.PI * 54;
  let precedingCount = 0;
  const segments = items.map((item) => {
    const offset = total > 0 ? (precedingCount / total) * circumference : 0;
    precedingCount += item.count;
    return { ...item, offset };
  });

  return (
    <figure className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
      <figcaption className="text-sm font-semibold text-slate-800">
        {title}
      </figcaption>
      {total === 0 ? (
        <div className="flex min-h-48 items-center justify-center text-xs text-slate-500">
          暂无{title}数据
        </div>
      ) : (
        <>
          <svg
            className="mx-auto my-4 size-36"
            viewBox="0 0 144 144"
            role="img"
            aria-label={`${title}，合计 ${total}${unit}。${items.map((item) => `${labels[String(item.key)] ?? String(item.key)} ${item.count}${unit}，占 ${Math.round((item.count / total) * 10_000) / 100}%`).join("；")}`}
          >
            <circle
              cx="72"
              cy="72"
              r="54"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="12"
            />
            <g transform="rotate(-90 72 72)">
              {segments
                .filter((item) => item.count > 0)
                .map((item) => (
                  <circle
                    key={String(item.key)}
                    cx="72"
                    cy="72"
                    r="54"
                    fill="none"
                    stroke={colors[String(item.key)] ?? "#64748b"}
                    strokeWidth="12"
                    strokeDasharray={`${(item.count / total) * circumference} ${circumference}`}
                    strokeDashoffset={-item.offset}
                  >
                    <title>{`${labels[String(item.key)] ?? String(item.key)}：${item.count}${unit}，占 ${Math.round((item.count / total) * 10_000) / 100}%`}</title>
                  </circle>
                ))}
            </g>
            <text
              x="72"
              y="70"
              textAnchor="middle"
              className="fill-slate-900 text-2xl font-semibold tabular-nums"
            >
              {total.toLocaleString("zh-CN")}
            </text>
            <text
              x="72"
              y="90"
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              合计 · {unit}
            </text>
          </svg>
          <ul className="space-y-1">
            {items.map((item) => {
              const label = labels[String(item.key)] ?? String(item.key);
              const ratio = Math.round((item.count / total) * 10_000) / 100;
              return (
                <li
                  className="flex items-center gap-2 rounded-lg px-1 py-2 text-xs"
                  key={String(item.key)}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: colors[String(item.key)] ?? "#64748b",
                    }}
                  />
                  <span className="min-w-0 flex-1 text-slate-600">{label}</span>
                  <strong className="font-semibold text-slate-900 tabular-nums">
                    {item.count.toLocaleString("zh-CN")}
                  </strong>
                  <span className="w-16 text-right text-slate-500 tabular-nums">
                    {ratio}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </figure>
  );
}

export function DistributionPanel({
  data,
  error,
  loading,
}: {
  data: DashboardDistributions | null;
  error: string | null;
  loading: boolean;
}) {
  return (
    <DashboardPanel
      description="查看本校用户角色构成与作业状态占比。"
      title="角色与作业分布"
    >
      {loading && !data ? (
        <SectionLoading label="正在汇总分布数据" />
      ) : error && !data ? (
        <SectionError message={error} />
      ) : !data ||
        (data.roles.length === 0 && data.assignmentStatuses.length === 0) ? (
        <SectionEmpty message="暂无可展示的分布数据。" />
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <DistributionChart
            items={data.roles}
            labels={ROLE_LABELS}
            colors={ROLE_COLORS}
            unit="人"
            title="用户角色"
          />
          <DistributionChart
            items={data.assignmentStatuses}
            labels={ASSIGNMENT_STATUS_LABELS}
            colors={ASSIGNMENT_STATUS_COLORS}
            unit="份"
            title="作业状态"
          />
        </div>
      )}
      {error && data ? (
        <p className="mt-3 text-xs text-amber-700">
          刷新失败，当前显示上一次成功数据。
        </p>
      ) : null}
    </DashboardPanel>
  );
}
