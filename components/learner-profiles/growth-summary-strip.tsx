import {
  Activity,
  CalendarDays,
  Sparkles,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";

import type { StudentGrowthSummary } from "@/services/learner-profiles/growth-summary";

/**
 * growth 四个子页共享的概览条。
 *
 * 分层策略（2026-11-25 调整）：
 *   - 「章节掌握」是唯一需要四个数字的板块，渲染完整四卡；
 *   - 其余三个板块只回答一行「最近有没有进步、下一步看什么」，用紧凑条替代，
 *     避免切 tab 时最显眼的一块毫无变化（那会让用户以为没切换成功）。
 *
 * 口径约定：「平均掌握度」是评分均值，「已掌握 n/总数」是计数占比，两者数值
 * 必然不同，所以必须各自带标签，不能都叫「掌握度」。
 */
export type GrowthSummarySection = "knowledge" | "path" | "profile" | "trends";

function deltaBadge(delta: number | null) {
  if (delta === null || delta === 0) return null;
  return (
    <span
      aria-label={`较上次${delta > 0 ? "提高" : "下降"} ${Math.abs(delta)} 个百分点`}
      className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        delta > 0
          ? "bg-emerald-50 text-emerald-700"
          : "bg-rose-50 text-rose-700"
      }`}
      title={`较上次${delta > 0 ? "提高" : "下降"} ${Math.abs(delta)} 个百分点`}
    >
      {delta > 0 ? "↑" : "↓"}
      {Math.abs(delta)}
    </span>
  );
}

export function GrowthSummaryStrip({
  summary,
  section = "knowledge",
}: {
  summary: StudentGrowthSummary;
  /** 当前板块。除章节掌握外只渲染单行摘要。 */
  section?: GrowthSummarySection;
}) {
  const delta = summary.masteryDelta;
  const coverage =
    summary.totalConcepts > 0
      ? `已掌握 ${summary.masteredConcepts}/${summary.totalConcepts} 个知识点${
          summary.masteredRatio === null ? "" : `（${summary.masteredRatio}%）`
        }`
      : "本课程还没有知识点";

  if (section !== "knowledge") {
    const facts: Array<{ icon: typeof Activity; text: string }> = [];
    if (section === "path") {
      facts.push({
        icon: TriangleAlert,
        text: `本周需要再练 ${summary.needsSupport} 个知识点`,
      });
      facts.push({ icon: TrendingUp, text: coverage });
    } else if (section === "profile") {
      facts.push({ icon: TrendingUp, text: coverage });
      facts.push({
        icon: CalendarDays,
        text: `画像更新于 ${summary.generatedAt.toLocaleString("zh-CN")}`,
      });
    } else {
      facts.push({
        icon: Activity,
        text: `近 ${summary.activityWindowDays} 天有评分 ${summary.activeDays} 天`,
      });
      facts.push({
        icon: Sparkles,
        text: `近 7 天新增 ${summary.weeklyEvidence} 条评分记录`,
      });
    }
    return (
      <section
        aria-label="知识与成长概览"
        className="border-line bg-card flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border px-3 py-2"
      >
        {facts.map(({ icon: Icon, text }) => (
          <p
            className="text-ink-body flex items-center gap-1.5 text-xs"
            key={text}
          >
            <Icon
              aria-hidden="true"
              className="text-ink-soft size-3.5 shrink-0"
            />
            {text}
          </p>
        ))}
        <p className="text-ink-soft ml-auto text-[11px]">
          数据更新于 {summary.generatedAt.toLocaleString("zh-CN")}
        </p>
      </section>
    );
  }

  const tiles = [
    {
      key: "mastery",
      label: "平均掌握度",
      icon: TrendingUp,
      iconClass: "bg-sky-100/70 text-sky-800",
      value: summary.mastery === null ? "—" : `${summary.mastery.toFixed(1)}%`,
      unit: "",
      detail: coverage,
      delta,
    },
    {
      key: "evidence",
      label: "近 7 天评分记录",
      icon: Sparkles,
      iconClass: "bg-violet-100/70 text-violet-800",
      value: `${summary.weeklyEvidence}`,
      unit: "条",
      detail:
        summary.weeklyEvidence > 0
          ? "作业与练习判分，按题目计数"
          : "近 7 天没有新的评分记录",
      delta: null,
    },
    {
      key: "needs-support",
      label: "需要再练的知识点",
      icon: TriangleAlert,
      iconClass: "bg-amber-100/70 text-amber-800",
      value: `${summary.needsSupport}`,
      unit: "个",
      detail:
        summary.needsSupport > 0
          ? "已评估但低于 80 分，可在下方按章定位"
          : "已评估的知识点都达到 80 分",
      delta: null,
    },
    {
      key: "activity",
      label: `近 ${summary.activityWindowDays} 天有评分的天数`,
      icon: Activity,
      iconClass: "bg-emerald-100/70 text-emerald-800",
      value: `${summary.activeDays}`,
      unit: "天",
      detail:
        summary.activeDays > 0
          ? "只统计有判分记录的日期"
          : "这段时间暂无评分记录",
      delta: null,
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
              {tile.key === "mastery" ? deltaBadge(tile.delta) : null}
            </p>
            <p className="text-ink-soft mt-1.5 text-[11px] leading-4">
              {tile.detail}
            </p>
          </div>
        ))}
      </div>
      <p className="text-ink-soft mt-3 text-[11px] leading-4">
        更新于 {summary.generatedAt.toLocaleString("zh-CN")}
        。「平均掌握度」取记录充足知识点的评分均值；「已掌握 n/总数」按达到 80
        分的知识点计数，两者算法不同，数值不会相等。
      </p>
    </section>
  );
}
