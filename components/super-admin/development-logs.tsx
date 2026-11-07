import { CalendarDays, Code2 } from "lucide-react";

import { DevelopmentLogsRefresh } from "@/components/super-admin/development-logs-refresh";
import type { SystemDevelopmentLog } from "@/services/super-admin/development-logs";

export function SuperAdminDevelopmentLogs({
  logs,
}: {
  logs: readonly SystemDevelopmentLog[];
}) {
  return (
    <section className="space-y-6" aria-labelledby="development-logs-title">
      <header className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50 p-6">
        <p className="flex items-center gap-2 text-sm font-medium text-sky-700">
          <Code2 aria-hidden="true" className="size-4" />
          研发记录
        </p>
        <h1
          id="development-logs-title"
          className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl"
        >
          系统开发日志
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          查看平台功能迭代、权限调整与专项验证记录。
        </p>
        <p className="text-muted-foreground mt-3 text-xs">
          {logs.length} 条研发记录 · 每分钟自动同步 · 最新记录在前
        </p>
        <div className="mt-4">
          <DevelopmentLogsRefresh />
        </div>
      </header>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sky-200 bg-white p-8 text-center">
          <p className="font-medium">暂无研发记录</p>
          <p className="text-muted-foreground mt-2 text-sm">
            在仓库根目录的 CHANGELOG.md 添加记录后，这里会自动同步。
          </p>
        </div>
      ) : (
        <ol className="relative space-y-5 border-l border-sky-200 pl-6">
          {logs.map((log) => (
            <li className="relative" key={`${log.date}-${log.title}`}>
              <span
                aria-hidden="true"
                className="absolute top-6 -left-[1.95rem] flex size-5 items-center justify-center rounded-full border-4 border-white bg-sky-500 shadow-sm"
              />
              <article className="rounded-xl border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100/60 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <time
                    className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
                    dateTime={log.date}
                  >
                    <CalendarDays aria-hidden="true" className="size-3.5" />
                    {log.date}
                  </time>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                    {log.category}
                  </span>
                </div>
                <h2 className="mt-3 text-base font-semibold text-slate-950">
                  {log.title}
                </h2>
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {log.summary}
                </p>
                <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
                  {log.details.map((detail) => (
                    <li className="flex gap-2" key={detail}>
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-500"
                      />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
                {log.verification ? (
                  <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
                    {log.verification}
                  </p>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
