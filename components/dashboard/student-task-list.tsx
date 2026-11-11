import {
  ArrowUpRight,
  CalendarCheck,
  Clock3,
  ClipboardCheck,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  studentTaskContext,
  studentTaskDate,
  type StudentTaskItem,
} from "@/services/dashboard/student-task-overview";

export const STUDENT_TASK_PRESENTATION = {
  exam: {
    label: "课程考试",
    icon: ClipboardCheck,
    color: "bg-amber-50 text-amber-800",
  },
  assignment: {
    label: "课程作业",
    icon: ClipboardList,
    color: "bg-sky-50 text-sky-700",
  },
  attendance: {
    label: "课堂签到",
    icon: CalendarCheck,
    color: "bg-emerald-50 text-emerald-700",
  },
  survey: {
    label: "课程问卷",
    icon: ClipboardCheck,
    color: "bg-violet-50 text-violet-700",
  },
};

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
      <ul className="divide-y divide-neutral-300 border-t border-neutral-300">
        {items.map((item) => {
          const start = item.kind === "exam" ? item.opensAt : undefined;
          const time = start ?? item.dueAt;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                title={`${studentTaskContext(item)} · ${item.state}`}
                className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-md py-2.5 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-sky-700 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-neutral-950"
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
    <ul className={cn("divide-y divide-slate-100", workspace && "@container")}>
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
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${presentation.color}`}
            >
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div className={cn("min-w-0", !workspace && "flex-1 basis-40")}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p
                  className={cn(
                    "max-w-full min-w-0 [overflow-wrap:anywhere] text-slate-900",
                    workspace ? "font-semibold" : "text-sm font-medium",
                  )}
                >
                  {item.title}
                  {!workspace && priority && (
                    <span className="ml-2 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-900">
                      优先处理
                    </span>
                  )}
                </p>
                <span
                  className={cn(
                    "text-xs text-slate-600",
                    workspace && "rounded-full bg-slate-100 px-2 py-0.5",
                  )}
                >
                  {item.state}
                </span>
                {workspace && priority && items.length > 1 && (
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                    优先处理
                  </span>
                )}
              </div>
              {showContext && (
                <p className="mt-1 text-xs leading-5 [overflow-wrap:anywhere] text-slate-600">
                  {studentTaskContext(item)}
                </p>
              )}
              <p
                className={cn(
                  "text-xs leading-5 text-slate-600",
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
                "inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700",
                workspace &&
                  "col-start-2 justify-self-start @min-[26rem]:col-start-3 @min-[26rem]:justify-self-end",
                workspace && priority
                  ? "border-sky-700 bg-sky-700 text-white hover:border-sky-800 hover:bg-sky-800"
                  : "border-slate-200 text-sky-700 hover:border-sky-200 hover:bg-sky-50",
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
