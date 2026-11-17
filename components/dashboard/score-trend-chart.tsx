"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";

import { shortKindLabel, withKind } from "@/components/dashboard/record-label";
import type { StudentClassAnalysis } from "@/services/dashboard/student-class-analytics";

type ScorePoint = StudentClassAnalysis["scoreHistory"][number];
type PracticePoint = StudentClassAnalysis["practiceHistory"][number];
type ChartTab = "all" | "assignment" | "exam" | "practice";

const tabOrder: ChartTab[] = ["all", "assignment", "exam", "practice"];
const tabLabels: Record<ChartTab, string> = {
  all: "全部成绩",
  assignment: "作业",
  exam: "考试",
  practice: "练习",
};

const emptyCopy: Record<ChartTab, { title: string; description: string }> = {
  all: {
    title: "等待第一份已公布成绩",
    description: "成绩公布后，我可以在这里查看每次作业与考试的得分。",
  },
  assignment: {
    title: "最近 8 项成绩中没有作业",
    description: "作业成绩公布后会进入这里；更早的作业可在下方记录表中查看。",
  },
  exam: {
    title: "最近 8 项成绩中没有考试",
    description: "考试成绩公布后会进入这里；连续新增作业不会把考试挤出本视图。",
  },
  practice: {
    title: "本课程还没有练习记录",
    description:
      "完成本课程知识点相关的推荐练习或自主练习后，正确率会按天汇总到这里。",
  },
};

/**
 * 「我的学习记录」主图。
 *
 * 三个成绩标签共用一条百分制折线，切换只换数据口径，不重新请求页面：
 * 选中项写回 ?chart=，刷新与分享可恢复。练习是课程级、按天聚合的正确率，
 * 用柱图单独表达，不并入成绩折线与均分。
 */
export function ScoreTrendChart({
  series,
  practice,
  practiceHref,
  initialTab = "all",
  status,
}: {
  series: Record<Exclude<ChartTab, "practice">, ScorePoint[]>;
  practice: PracticePoint[];
  practiceHref: string;
  initialTab?: ChartTab;
  status: {
    total: number;
    published: number;
    awaiting: number;
    unsubmitted: number;
    examEnded: number;
    examSubmitted: number;
  };
}) {
  const [tab, setTab] = useState<ChartTab>(initialTab);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pointRefs = useRef<Array<SVGGElement | null>>([]);

  const points = tab === "practice" ? [] : series[tab];
  const active =
    activeIndex !== null ? points[activeIndex] : points[points.length - 1];
  const countFor = (key: ChartTab) =>
    key === "practice" ? practice.length : series[key].length;

  function selectTab(next: ChartTab, focus = false) {
    setTab(next);
    setActiveIndex(null);
    if (focus) {
      const index = tabOrder.indexOf(next);
      tabRefs.current[index]?.focus();
    }
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("chart");
    else url.searchParams.set("chart", next);
    window.history.replaceState(null, "", url);
  }

  function onTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    const nextIndex =
      (index + (forward ? 1 : -1) + tabOrder.length) % tabOrder.length;
    selectTab(tabOrder[nextIndex], true);
  }

  function movePoint(index: number, delta: number) {
    const next = Math.min(Math.max(index + delta, 0), points.length - 1);
    setActiveIndex(next);
    pointRefs.current[next]?.focus();
  }

  const left = 44;
  const right = 16;
  const width = Math.max(560, left + points.length * 100 + right);
  const plotWidth = width - left - right;
  const xs = points.map(
    (_, index) => left + ((index + 0.5) * plotWidth) / points.length,
  );
  const y = (value: number) => 160 - value * 1.28;
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${xs[index]},${y(point.percentage)}`,
    )
    .join(" ");
  const stripTotal = status.total;
  const percent = (value: number) =>
    stripTotal ? `${(value / stripTotal) * 100}%` : "0%";
  const emptyState = (
    <div className="mt-3 flex min-h-44 flex-1 flex-col items-center justify-center rounded-xl bg-slate-50/80 px-5 text-center">
      <p className="text-sm font-medium text-slate-600">
        {emptyCopy[tab].title}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {emptyCopy[tab].description}
      </p>
    </div>
  );

  return (
    <div className="mt-4 flex min-w-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label="学习记录统计口径"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1"
      >
        {tabOrder.map((key, index) => {
          const selected = key === tab;
          return (
            <button
              key={key}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(key)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${
                selected
                  ? "bg-white text-sky-900 shadow-sm"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
              }`}
            >
              {tabLabels[key]}
              <span
                className={`text-xs font-normal tabular-nums ${
                  selected ? "text-slate-500" : "text-slate-500"
                }`}
              >
                {countFor(key)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {tab === "all"
          ? "最近 8 项已公布成绩（作业与考试合并），按百分制展示"
          : tab === "exam"
            ? "最近 8 项已公布考试成绩，按百分制展示"
            : tab === "practice"
              ? "本课程最近 8 个练习日的正确率，按天汇总；不计入课程成绩"
              : "最近 8 项已公布作业成绩，按百分制展示"}
      </p>

      {tab === "practice" ? (
        practice.length ? (
          <PracticeChart days={practice} href={practiceHref} />
        ) : (
          emptyState
        )
      ) : points.length === 0 ? (
        emptyState
      ) : points.length === 1 ? (
        <div className="mt-3 flex flex-1 flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-5">
          <p className="text-xs font-medium text-slate-600">
            最近一次已公布成绩
          </p>
          <p className="mt-2 text-sm font-medium [overflow-wrap:anywhere] break-words text-slate-900">
            {withKind(points[0].kind, points[0].title)}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1.5">
            <p className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {points[0].percentage}
              <span className="ml-1 text-sm font-medium text-slate-600">
                分
              </span>
            </p>
            {points[0].submittedAt ? (
              <p className="text-xs text-slate-600 tabular-nums">
                {points[0].submittedAt.toLocaleDateString("zh-CN")} 提交
              </p>
            ) : null}
          </div>
          <p className="mt-auto pt-3 text-xs leading-5 text-slate-600">
            只有 1 项已公布成绩，暂时不展示趋势；累积到 2
            项后会自动显示变化曲线。
          </p>
          <Link
            className="mt-3 inline-flex min-h-10 w-fit items-center gap-1.5 rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-900 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            href={points[0].href}
          >
            查看成绩与教师反馈
          </Link>
        </div>
      ) : (
        <figure className="mt-3 flex min-w-0 flex-1 flex-col">
          <div
            role="region"
            aria-label="成绩趋势图，可横向滚动"
            tabIndex={0}
            className="flex items-center overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-sky-700"
          >
            <div
              className="w-full"
              style={{
                minWidth: Math.max(340, left + points.length * 82 + right),
              }}
            >
              <svg
                viewBox={`0 0 ${width} 176`}
                className="block w-full"
                role="img"
                aria-label={`${tabLabels[tab]}趋势图，共 ${points.length} 项，按百分制展示`}
              >
                <title>{`${tabLabels[tab]}变化`}</title>
                <desc>
                  {points
                    .map((point) => `${point.title}：${point.percentage}分`)
                    .join("；")}
                </desc>
                {[0, 50, 100].map((value) => (
                  <g key={value}>
                    <line
                      x1={left}
                      y1={y(value)}
                      x2={width - right}
                      y2={y(value)}
                      stroke="#e2e8f0"
                      strokeDasharray="4 5"
                    />
                    <text
                      x={left - 8}
                      y={y(value) + 4}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize="11"
                    >
                      {value}
                    </text>
                  </g>
                ))}
                <path
                  d={`${path} L${xs[xs.length - 1]},160 L${xs[0]},160 Z`}
                  fill="#e0f2fe"
                  fillOpacity="0.65"
                />
                <path
                  d={path}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {points.map((point, index) => {
                  const labelY = y(point.percentage) - 12;
                  const placed =
                    labelY < 14 ? y(point.percentage) + 18 : labelY;
                  const isExam = point.kind !== "ASSIGNMENT";
                  return (
                    <g
                      key={point.id}
                      ref={(node) => {
                        pointRefs.current[index] = node;
                      }}
                      role="button"
                      tabIndex={
                        activeIndex === index ||
                        (activeIndex === null && index === 0)
                          ? 0
                          : -1
                      }
                      aria-label={`${shortKindLabel(point.kind)} ${point.title}，${point.percentage} 分，查看详情`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowRight") {
                          event.preventDefault();
                          movePoint(index, 1);
                        } else if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          movePoint(index, -1);
                        } else if (event.key === "Home") {
                          event.preventDefault();
                          movePoint(index, -index);
                        } else if (event.key === "End") {
                          event.preventDefault();
                          movePoint(index, points.length - 1 - index);
                        }
                      }}
                      className="cursor-pointer focus-visible:outline-none"
                    >
                      {activeIndex === index && (
                        <circle
                          cx={xs[index]}
                          cy={y(point.percentage)}
                          r="9"
                          fill="none"
                          stroke="#0369a1"
                          strokeWidth="1.5"
                          strokeOpacity="0.45"
                        />
                      )}
                      {isExam ? (
                        <path
                          d={`M${xs[index]},${y(point.percentage) - 5} l5,5 l-5,5 l-5,-5 Z`}
                          fill="white"
                          stroke="#0284c7"
                          strokeWidth="2.5"
                        />
                      ) : (
                        <circle
                          cx={xs[index]}
                          cy={y(point.percentage)}
                          r="4"
                          fill="white"
                          stroke="#0284c7"
                          strokeWidth="2.5"
                        />
                      )}
                      <text
                        x={xs[index]}
                        y={placed}
                        textAnchor="middle"
                        fill="#0369a1"
                        fontSize="12"
                        fontWeight="600"
                      >
                        {point.percentage}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <ol
                aria-label="横轴任务名称"
                className="grid pb-2 text-center text-xs leading-5 text-slate-700"
                style={{
                  gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`,
                  paddingInline: `${(left / width) * 100}% ${(right / width) * 100}%`,
                }}
              >
                {points.map((point) => (
                  <li
                    key={point.id}
                    className="min-w-0 px-1"
                    title={point.title}
                  >
                    <span className="line-clamp-2 [overflow-wrap:anywhere]">
                      {withKind(point.kind, point.title)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          {active ? (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {withKind(active.kind, active.title)}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-medium text-slate-900 tabular-nums">
                  {active.percentage} 分
                </span>
                <Link
                  className="font-medium text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                  href={active.href}
                >
                  查看详情
                </Link>
              </span>
            </div>
          ) : null}
          <p className="mt-1 text-xs leading-5 text-slate-500">
            悬停、轻点或用方向键移动图示点位，可切换上方显示的任务与分数。
          </p>
          <ol className="sr-only">
            {points.map((point) => (
              <li key={`sr-${point.id}`}>
                {shortKindLabel(point.kind)} · {point.title}：{point.percentage}{" "}
                分
              </li>
            ))}
          </ol>
        </figure>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        {stripTotal ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>
                在线任务 {stripTotal} 项 · 已结束考试 {status.examEnded}{" "}
                场（已交卷 {status.examSubmitted} 场）
              </span>
              <span className="tabular-nums">
                已公布 {status.published} · 待公布 {status.awaiting} · 未提交{" "}
                {status.unsubmitted}
              </span>
            </div>
            <div
              className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100"
              role="img"
              aria-label={`在线任务 ${stripTotal} 项：已公布 ${status.published} 项，待公布 ${status.awaiting} 项，未提交 ${status.unsubmitted} 项`}
            >
              <div
                className="bg-sky-600"
                style={{ width: percent(status.published) }}
              />
              <div
                className="bg-indigo-300"
                style={{ width: percent(status.awaiting) }}
              />
              <div
                className="bg-slate-200"
                style={{ width: percent(status.unsubmitted) }}
              />
            </div>
          </>
        ) : (
          <p className="text-xs leading-5 text-slate-500">
            当前教学班暂无在线任务。
          </p>
        )}
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {stripTotal
            ? "提交情况与评分状态分别统计，待公布成绩不计为零分；以上数字统计当前教学班的在线任务。"
            : `台账录入的成绩不计入提交情况。已结束考试 ${status.examEnded} 场（已交卷 ${status.examSubmitted} 场）。`}
        </p>
      </div>
    </div>
  );
}

/**
 * 练习口径柱图。
 *
 * 一天一根柱：柱高 = 当天正确率，柱下日期为横轴，明细行给出题量与正确率。
 * 只包含与本课程相关的推荐练习与自主练习（服务端已按 courseCycle 过滤），
 * 绿色仅用于区分「练习」这一非成绩口径，不进入成绩均分。
 */
function PracticeChart({
  days,
  href,
}: {
  days: PracticePoint[];
  href: string;
}) {
  const left = 44;
  const right = 16;
  const width = Math.max(560, left + days.length * 100 + right);
  const slot = (width - left - right) / days.length;
  const barWidth = Math.min(26, slot * 0.36);
  const y = (value: number) => 160 - value * 1.28;
  const answered = days.reduce((sum, day) => sum + day.answered, 0);
  const correct = days.reduce((sum, day) => sum + day.correct, 0);
  const overall = answered ? Math.round((correct / answered) * 100) : 0;

  return (
    <figure className="mt-3 flex min-w-0 flex-1 flex-col">
      <div
        role="region"
        aria-label="练习正确率图，可横向滚动"
        tabIndex={0}
        className="flex items-center overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-sky-700"
      >
        <div
          className="w-full"
          style={{ minWidth: Math.max(340, left + days.length * 82 + right) }}
        >
          <svg
            viewBox={`0 0 ${width} 176`}
            className="block w-full"
            role="img"
            aria-label={`本课程最近 ${days.length} 个练习日正确率，共 ${answered} 道题，整体正确率 ${overall}%`}
          >
            <title>练习正确率</title>
            <desc>
              {days
                .map(
                  (day) =>
                    `${day.label}：${day.answered} 题，正确率 ${day.rate}%`,
                )
                .join("；")}
            </desc>
            {[0, 50, 100].map((value) => (
              <g key={value}>
                <line
                  x1={left}
                  y1={y(value)}
                  x2={width - right}
                  y2={y(value)}
                  stroke="#e2e8f0"
                  strokeDasharray="4 5"
                />
                <text
                  x={left - 8}
                  y={y(value) + 4}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="11"
                >
                  {value}
                </text>
              </g>
            ))}
            {days.map((day, index) => {
              const cx = left + (index + 0.5) * slot;
              const height = Math.max(2, day.rate * 1.28);
              return (
                <g key={day.id}>
                  <rect
                    x={cx - barWidth / 2}
                    y={160 - height}
                    width={barWidth}
                    height={height}
                    rx="4"
                    fill="#0f766e"
                    fillOpacity="0.85"
                  >
                    <title>{`${day.label}：${day.answered} 题，正确率 ${day.rate}%`}</title>
                  </rect>
                  <text
                    x={cx}
                    y={160 - height - 6}
                    textAnchor="middle"
                    fill="#0f766e"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {day.rate}
                  </text>
                </g>
              );
            })}
          </svg>
          <ol
            aria-label="横轴练习日期"
            className="grid pb-2 text-center text-xs leading-5 text-slate-700"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              paddingInline: `${(left / width) * 100}% ${(right / width) * 100}%`,
            }}
          >
            {days.map((day) => (
              <li key={day.id} className="min-w-0 px-1">
                <span className="tabular-nums">{day.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="min-w-0">
          合计 {answered} 道 · 答对 {correct} 道
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="font-medium text-slate-900 tabular-nums">
            正确率 {overall}%
          </span>
          <Link
            className="font-medium text-sky-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            href={href}
          >
            去练习
          </Link>
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        只统计与本课程知识点相关的推荐练习与自主练习，按天汇总；练习不计入课程成绩，也不参与均分与提交率。
      </p>
      <ol className="sr-only">
        {days.map((day) => (
          <li key={`sr-${day.id}`}>
            {day.label}：{day.answered} 题，正确率 {day.rate}%
          </li>
        ))}
      </ol>
    </figure>
  );
}
