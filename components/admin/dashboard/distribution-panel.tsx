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
  ADMIN: "管理员",
  TEACHER: "教师",
  STUDENT: "学生",
};
const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CLOSED: "已结束",
  ARCHIVED: "已归档",
};

function DistributionBars<T extends string | number>({
  items,
  labels,
  title,
}: {
  items: DistributionItem<T>[];
  labels: Record<string, string>;
  title: string;
}) {
  const maximum = Math.max(1, ...items.map((item) => item.count));
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <figure>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-muted-foreground text-xs">
          合计 {total.toLocaleString("zh-CN")}
        </span>
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const label = labels[String(item.key)] ?? String(item.key);
          const ratio =
            total === 0 ? 0 : Math.round((item.count / total) * 10_000) / 100;
          return (
            <div key={String(item.key)}>
              <div className="mb-1 flex justify-between gap-4 text-xs">
                <span>{label}</span>
                <span>
                  {item.count.toLocaleString("zh-CN")} · {ratio}%
                </span>
              </div>
              <div
                aria-label={`${label} ${item.count}`}
                className="bg-muted h-3 overflow-hidden rounded-full"
                role="img"
              >
                <div
                  className="h-full rounded-full bg-gray-800"
                  style={{
                    width: `${item.count === 0 ? 0 : Math.max(3, (item.count / maximum) * 100)}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="text-muted-foreground mt-4 text-xs">
        分类键来自数据库稳定枚举，中文仅在页面映射。
      </figcaption>
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
      description="仅展示当前数据模型存在且数据库中有真实记录的分类。"
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
        <div className="grid gap-8 md:grid-cols-2">
          <DistributionBars
            items={data.roles}
            labels={ROLE_LABELS}
            title="用户角色"
          />
          <DistributionBars
            items={data.assignmentStatuses}
            labels={ASSIGNMENT_STATUS_LABELS}
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
