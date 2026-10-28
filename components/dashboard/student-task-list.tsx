import {
  ArrowUpRight,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import {
  studentTaskContext,
  studentTaskDate,
  type StudentTaskItem,
} from "@/services/dashboard/student-task-overview";

export const STUDENT_TASK_PRESENTATION = {
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

export function StudentTaskList({ items }: { items: StudentTaskItem[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => {
        const presentation = STUDENT_TASK_PRESENTATION[item.kind];
        const Icon = presentation.icon;
        return (
          <li
            key={item.id}
            className="flex min-w-0 flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0"
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${presentation.color}`}
            >
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1 basis-40">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="max-w-full min-w-0 text-sm font-medium break-words text-slate-900">
                  {item.title}
                </p>
                <span className="text-xs text-slate-500">{item.state}</span>
              </div>
              <p className="mt-1 text-xs leading-5 break-words text-slate-500">
                {studentTaskContext(item)}
              </p>
              <p className="text-xs leading-5 text-slate-500">
                {studentTaskDate(item.dueAt)}{" "}
                {item.kind === "attendance" ? "结束签到" : "截止"}
                {item.kind === "survey" ? " · 不计入成绩" : ""}
              </p>
            </div>
            <Link
              aria-label={`${item.action}：${item.title}`}
              href={item.href}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-sky-700 transition hover:border-sky-200 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
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
