import {
  ArrowUpRight,
  CalendarCheck,
  Clock3,
  ClipboardCheck,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./ui-focus";
import {
  studentTaskContext,
  studentTaskDate,
  type StudentTaskItem,
} from "@/services/dashboard/student-task-overview";

/**
 * 任务类别的唯一真源。
 *
 * color：图标底。按 S3/D17 的结论统一为中性 —— 此前四类各占一个色相
 *        （琥珀/蓝/绿/紫），加上品牌色和三个状态色，一屏出现 5 个以上色相。
 *        类别改由图标形状 + 上下文文字承担，图标底只提供"这里有张图"的结构感。
 *
 * mark：需要传给 SVG / 内联样式的色值（类别环、筛选色点）。
 *       取同一品牌色的 4 级明度而非 4 个色相，配合图例文字区分类别。
 *       顺序与 student-home-tasks 里环图的分段顺序一致，两处共用此真源。
 */
export const STUDENT_TASK_PRESENTATION = {
  exam: {
    label: "课程考试",
    icon: ClipboardCheck,
    color: "bg-neutral-100 text-neutral-700",
    mark: "color-mix(in srgb, var(--brand) 30%, #fff)",
  },
  assignment: {
    label: "课程作业",
    icon: ClipboardList,
    color: "bg-neutral-100 text-neutral-700",
    mark: "var(--brand)",
  },
  attendance: {
    label: "课堂签到",
    icon: CalendarCheck,
    color: "bg-neutral-100 text-neutral-700",
    mark: "color-mix(in srgb, var(--brand) 68%, #fff)",
  },
  survey: {
    label: "课程问卷",
    icon: ClipboardCheck,
    color: "bg-neutral-100 text-neutral-700",
    mark: "color-mix(in srgb, var(--brand) 48%, #fff)",
  },
} as const;

export function StudentTaskList({
  items,
  priorityId,
  showContext = true,
  layout = "compact",
}: {
  items: StudentTaskItem[];
  priorityId?: string;
  showContext?: boolean;
  layout?: "compact" | "workspace" | "home";
}) {
  if (layout === "home") {
    return (
      <ul className="divide-border border-border divide-y border-t">
        {items.map((item) => {
          const start = item.kind === "exam" ? item.opensAt : undefined;
          const time = start ?? item.dueAt;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                title={`${studentTaskContext(item)} · ${item.state}`}
                className={`hover:bg-muted grid min-h-12 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-md py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${FOCUS_RING}`}
              >
                <span
                  aria-hidden="true"
                  className="bg-brand size-2 rounded-full"
                />
                <span className="font-medium [overflow-wrap:anywhere]">
                  <span className="sr-only">{item.action}：</span>
                  {item.title}
                  {item.id === priorityId && (
                    <span className="sr-only"> 优先处理</span>
                  )}
                </span>
                <span className="col-start-2 text-sm text-neutral-600 sm:col-start-auto sm:text-end">
                  {start
                    ? "开考"
                    : item.kind === "attendance"
                      ? "签到截止"
                      : "截止"}{" "}
                  <time dateTime={time.toISOString()}>
                    {studentTaskDate(time)}
                  </time>
                  <span className="sr-only">
                    {item.windowMinutes !== undefined &&
                      ` · 限时 ${item.windowMinutes} 分钟`}
                    {item.kind === "survey" && " · 不计入成绩"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  const workspace = layout === "workspace";
  return (
    <ul
      className={cn("divide-y divide-neutral-200", workspace && "@container")}
    >
      {items.map((item) => {
        const presentation = STUDENT_TASK_PRESENTATION[item.kind];
        const Icon = presentation.icon;
        const priority = item.id === priorityId;
        return (
          <li
            key={item.id}
            className={cn(
              "min-w-0 gap-3 py-4",
              workspace
                ? "grid grid-cols-[auto_minmax(0,1fr)] items-start px-4 sm:px-5 @min-[26rem]:grid-cols-[auto_minmax(0,1fr)_auto] @min-[26rem]:items-center"
                : "flex flex-wrap items-center first:pt-0 last:pb-0",
            )}
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                presentation.color,
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div className={cn("min-w-0", !workspace && "flex-1 basis-40")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p
                  className={cn(
                    "max-w-full min-w-0 [overflow-wrap:anywhere] text-neutral-900",
                    workspace ? "font-semibold" : "text-sm font-medium",
                  )}
                >
                  {item.title}
                  {!workspace && priority && (
                    <span className="bg-brand/10 text-brand-strong ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium">
                      优先处理
                    </span>
                  )}
                </p>
                <span
                  className={cn(
                    "text-xs text-neutral-600",
                    workspace && "rounded-full bg-neutral-100 px-2 py-0.5",
                  )}
                >
                  {item.state}
                </span>
                {workspace && priority && items.length > 1 && (
                  <span className="bg-brand/10 text-brand-strong rounded-full px-2 py-0.5 text-xs font-medium">
                    优先处理
                  </span>
                )}
              </div>
              {showContext && (
                <p className="mt-1 text-xs leading-5 [overflow-wrap:anywhere] text-neutral-600">
                  {studentTaskContext(item)}
                </p>
              )}
              <p
                className={cn(
                  "text-xs leading-5 text-neutral-600",
                  workspace && "mt-0.5",
                )}
              >
                {workspace && (
                  <Clock3
                    aria-hidden="true"
                    className="mr-1 inline size-3.5 align-text-bottom"
                  />
                )}
                {item.kind === "exam" && item.opensAt ? (
                  <>
                    开考{" "}
                    <time dateTime={item.opensAt.toISOString()}>
                      {studentTaskDate(item.opensAt)}
                    </time>
                    {item.windowMinutes !== undefined &&
                      ` · 限时 ${item.windowMinutes} 分钟`}
                  </>
                ) : (
                  <>
                    {item.kind === "attendance" ? "结束签到" : "截止"}{" "}
                    <time dateTime={item.dueAt.toISOString()}>
                      {studentTaskDate(item.dueAt)}
                    </time>
                  </>
                )}
                {item.kind === "survey" ? " · 不计入成绩" : ""}
              </p>
            </div>
            <Link
              aria-label={`${item.action}：${item.title}`}
              href={item.href}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                FOCUS_RING,
                workspace &&
                  "col-start-2 justify-self-start @min-[26rem]:col-start-3 @min-[26rem]:justify-self-end",
                workspace && priority
                  ? "border-brand bg-brand hover:border-brand-strong hover:bg-brand-strong text-white"
                  : "text-brand border-neutral-300 hover:border-neutral-400 hover:bg-neutral-200",
              )}
            >
              {item.action}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
