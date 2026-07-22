import {
  Activity,
  Bot,
  ClipboardList,
  ScrollText,
  Sparkles,
  UserPlus,
} from "lucide-react";
import Link from "next/link";

import {
  DashboardPanel,
  SectionEmpty,
  SectionError,
  SectionLoading,
} from "@/components/admin/dashboard/section-state";
import type {
  DashboardActivities,
  DashboardActivityType,
} from "@/services/admin/dashboard/types";

const LABELS: Record<Exclude<DashboardActivityType, "ALL">, string> = {
  USER_CREATED: "新增用户",
  ASSIGNMENT_PUBLISHED: "作业发布",
  ANALYSIS_GENERATED: "学情分析",
  RECOMMENDATION_GENERATED: "推荐生成",
  ADMIN_AUDIT: "管理审计",
  AI_FAILURE: "AI 异常",
};
const ICONS = {
  USER_CREATED: UserPlus,
  ASSIGNMENT_PUBLISHED: ClipboardList,
  ANALYSIS_GENERATED: Activity,
  RECOMMENDATION_GENERATED: Sparkles,
  ADMIN_AUDIT: ScrollText,
  AI_FAILURE: Bot,
} as const;

export function ActivityPanel({
  data,
  error,
  loading,
}: {
  data: DashboardActivities | null;
  error: string | null;
  loading: boolean;
}) {
  return (
    <DashboardPanel
      description="最多展示 10 条必要摘要，不包含审计详情、提示词或原始 AI 错误。"
      title="最近动态"
    >
      {loading && !data ? (
        <SectionLoading label="正在读取最近动态" />
      ) : error && !data ? (
        <SectionError message={error} />
      ) : !data || data.items.length === 0 ? (
        <SectionEmpty message="暂无可展示的最近动态。" />
      ) : (
        <ol className="divide-y">
          {data.items.map((item) => {
            const Icon = ICONS[item.type];
            const content = (
              <div className="flex gap-3 py-3">
                <span className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs">
                      {LABELS[item.type]}
                    </span>
                    <time
                      className="text-muted-foreground text-xs"
                      dateTime={item.occurredAt}
                    >
                      {new Date(item.occurredAt).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })}
                    </time>
                  </div>
                  <p className="mt-1 text-sm leading-5">{item.summary}</p>
                </div>
              </div>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    className="block rounded-lg hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2"
                    href={item.href}
                  >
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ol>
      )}
      {error && data ? (
        <p className="mt-3 text-xs text-amber-700">
          刷新失败，当前显示上一次成功数据。
        </p>
      ) : null}
    </DashboardPanel>
  );
}
