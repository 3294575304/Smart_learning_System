import { Activity, CalendarDays, Sparkles, TrendingUp } from "lucide-react";

import type { StudentGrowthSummary } from "@/services/learner-profiles/growth-summary";

/**
 * 四个 growth 子页共用的概览条。
 * 只回答一个问题：「我最近有没有进步、下一步该看什么」。
 * 所有数字都来自最新画像快照，不额外计算口径。
 */
export function GrowthSummaryStrip({
  summary,
}: {
  summary: StudentGrowthSummary;
}) {
  const delta = summary.masteryDelta;
  const tiles = [
    {
      key: "mastery",
      label: "知识掌握度",
      icon: TrendingUp,
      iconClass: "bg-sky-100/70 text-sky-800",
      value: summary.mastery === null ? "—" : `${summary.mastery.toFixed(1)}%`,
      unit: summary.mastery === null ? "" : "",
      detail:
        delta === null
          ? summary.mastery === null
            ? "还没有足够的评分记录"
            : "暂无可比较的上次记录"
          : delta === 0
            ? "与上次持平"
            : `较上次 ${delta > 0 ? "+" : ""}${delta} 个百分点`,
    },
    {
      key: "evidence",
      label: "近 7 天新增评分记录",
      icon: Sparkles,
      iconClass: "bg-violet-100/70 text-violet-800",
      value: `${summary.weeklyEvidence}`,
      unit: "条",
      detail:
        summary.weeklyEvidence > 0
          ? "作业与练习的评分记录"
          : "近 7 天没有新的评分记录",
    },
    {
      key: "needs-support",
      label: "待巩固知识点",
      icon: CalendarDays,
      iconClass: "bg-amber-100/70 text-amber-800",
      value: `${summary.needsSupport}`,
      unit: "个",
      detail:
        summary.needsSupport > 0
          ? "评分记录充足但掌握度低于 80%"
          : "评分记录充足的知识点都已掌握",
    },
    {
      key: "activity",
      label: `近 ${summary.activityWindowDays} 天活跃`,
      icon: Activity,
      iconClass: "bg-emerald-100/70 text-emerald-800",
      value: `${summary.activeDays}`,
      unit: "天",
      detail:
        summary.activeDays > 0 ? "有评分记录的天数" : "这段时间暂无评分记录",
    },
  ] as const;
  return (
    <section
      aria-label="知识与成长概览"
      className="border-line bg-card rounded-xl border p-4"
    >
      {/*
        移动端用横向滚动的一条，避免四个卡片把正文推到第二屏；
        xl 及以上恢复四列网格。
      */}
      <div className="-mx-1 flex [scrollbar-width:none] gap-3 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] xl:mx-0 xl:grid xl:grid-cols-4 xl:overflow-visible xl:px-0 xl:pb-0 [&::-webkit-scrollbar]:hidden">
        {tiles.map((tile) => (
          <div
            className="border-line bg-muted/30 min-w-[150px] flex-1 rounded-lg border p-3 xl:min-w-0"
            key={tile.key}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-md ${tile.iconClass}`}
              >
                <tile.icon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="text-ink-soft text-xs">{tile.label}</span>
            </div>
            <p className="text-ink mt-2 flex flex-wrap items-baseline gap-1 text-[22px] leading-none font-semibold tabular-nums">
              {tile.value}
              {tile.unit ? (
                <span className="text-ink-soft text-xs font-medium">
                  {tile.unit}
                </span>
              ) : null}
              {tile.key === "mastery" && delta !== null && delta !== 0 ? (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                    delta > 0
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}
                </span>
              ) : null}
            </p>
            <p className="text-ink-soft mt-1.5 text-[11px] leading-4">
              {tile.detail}
            </p>
          </div>
        ))}
      </div>
      <p className="text-ink-soft mt-3 text-[11px] leading-4">
        更新于 {summary.generatedAt.toLocaleString("zh-CN")}
        。掌握度只统计评分记录充足的知识点，未评估的知识点不计入。
      </p>
    </section>
  );
}
