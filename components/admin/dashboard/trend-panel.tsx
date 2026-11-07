"use client";

import { useId, useState } from "react";

import {
  DashboardPanel,
  SectionEmpty,
  SectionError,
  SectionLoading,
} from "@/components/admin/dashboard/section-state";
import type {
  DashboardRange,
  DashboardTrends,
  TrendPoint,
} from "@/services/admin/dashboard/types";

interface Series {
  key: keyof Pick<
    TrendPoint,
    "users" | "assignments" | "submissions" | "answers"
  >;
  label: string;
  color: string;
}

function TrendChart({
  points,
  series,
  title,
}: {
  points: TrendPoint[];
  series: Series[];
  title: string;
}) {
  const descriptionId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => series.map((item) => point[item.key])),
  );
  const magnitude = 10 ** Math.floor(Math.log10(maximum / 4));
  const step = Math.max(
    1,
    ([1, 2, 5, 10].find((value) => value * magnitude >= maximum / 4) ?? 10) *
      magnitude,
  );
  const tickCount = Math.ceil(maximum / step);
  const ceiling = tickCount * step;
  const height = 208;
  const slotWidth = 600 / Math.max(1, points.length);
  const barWidth = Math.min(18, slotWidth * 0.32);
  const barGap = Math.min(3, slotWidth * 0.1);
  const groupWidth = series.length * barWidth + (series.length - 1) * barGap;
  const x = (index: number) => slotWidth * (index + 0.5);
  const y = (value: number) => height - (value / ceiling) * (height - 12);
  const dateIndexes = Array.from(
    { length: Math.min(5, points.length) },
    (_, index) =>
      Math.round(
        (index * (points.length - 1)) / Math.min(4, points.length - 1 || 1),
      ),
  );
  const active =
    points[Math.min(activeIndex ?? points.length - 1, points.length - 1)];

  return (
    <figure className="min-w-0 rounded-xl border border-slate-100 bg-white/70 p-4 sm:p-5">
      <figcaption className="text-sm font-semibold text-slate-800">
        {title}
      </figcaption>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        {series.map((item) => (
          <span
            className="flex items-center gap-1.5 text-slate-600"
            key={item.key}
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
            <strong className="ml-1 font-semibold text-slate-900 tabular-nums">
              {points
                .reduce((sum, point) => sum + point[item.key], 0)
                .toLocaleString("zh-CN")}
            </strong>
          </span>
        ))}
      </div>
      <div className="mt-5 flex gap-2">
        <div
          aria-hidden="true"
          className="relative w-8 shrink-0 text-right text-[10px] text-slate-400 tabular-nums"
        >
          {Array.from({ length: tickCount + 1 }, (_, index) => {
            const value = (tickCount - index) * step;
            return (
              <span
                className="absolute right-0 -translate-y-1/2"
                key={value}
                style={{ top: y(value) }}
              >
                {value.toLocaleString("zh-CN")}
              </span>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <svg
            aria-label={`${title}每日趋势，使用左右方向键查看每日数据`}
            aria-describedby={descriptionId}
            className="h-52 w-full rounded outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            viewBox="0 0 600 208"
            preserveAspectRatio="none"
            role="group"
            tabIndex={0}
            onFocus={() =>
              setActiveIndex((current) => current ?? points.length - 1)
            }
            onBlur={() => setActiveIndex(null)}
            onPointerLeave={() => setActiveIndex(null)}
            onKeyDown={(event) => {
              if (
                event.key !== "ArrowLeft" &&
                event.key !== "ArrowRight" &&
                event.key !== "Home" &&
                event.key !== "End"
              )
                return;
              event.preventDefault();
              setActiveIndex((current) => {
                const index = current ?? points.length - 1;
                if (event.key === "Home") return 0;
                if (event.key === "End") return points.length - 1;
                return Math.max(
                  0,
                  Math.min(
                    points.length - 1,
                    index + (event.key === "ArrowLeft" ? -1 : 1),
                  ),
                );
              });
            }}
          >
            {Array.from({ length: tickCount + 1 }, (_, index) => (
              <line
                key={index}
                x1="0"
                x2="600"
                y1={y(index * step)}
                y2={y(index * step)}
                stroke="#e2e8f0"
                strokeDasharray={index === 0 ? undefined : "3 5"}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {points.map((point, index) => (
              <g key={point.date}>
                {series.map((item, seriesIndex) =>
                  point[item.key] > 0 ? (
                    <rect
                      key={item.key}
                      x={
                        x(index) -
                        groupWidth / 2 +
                        seriesIndex * (barWidth + barGap)
                      }
                      y={y(point[item.key])}
                      width={barWidth}
                      height={height - y(point[item.key])}
                      rx={Math.min(3, barWidth / 3)}
                      fill={item.color}
                      opacity={0.9}
                    >
                      <title>{`${point.date} · ${item.label}：${point[item.key]}`}</title>
                    </rect>
                  ) : null,
                )}
              </g>
            ))}
            {activeIndex !== null && active ? (
              <line
                x1={x(Math.min(activeIndex, points.length - 1))}
                x2={x(Math.min(activeIndex, points.length - 1))}
                y1="0"
                y2={height}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {points.map((point, index) => (
              <rect
                key={point.date}
                x={index * slotWidth}
                y="0"
                width={slotWidth}
                height={height}
                fill="transparent"
                aria-hidden="true"
                onPointerEnter={() => setActiveIndex(index)}
                onPointerDown={() => setActiveIndex(index)}
              >
                <title>{`${point.date} · ${series.map((item) => `${item.label}：${point[item.key]}`).join("；")}`}</title>
              </rect>
            ))}
          </svg>
          <div
            aria-hidden="true"
            className="relative mt-3 h-4 text-[10px] whitespace-nowrap text-slate-500 tabular-nums"
          >
            {dateIndexes.map((index, labelIndex) => (
              <span
                className="absolute"
                key={index}
                style={{
                  left: `${(x(index) / 600) * 100}%`,
                  transform:
                    labelIndex === 0
                      ? "none"
                      : labelIndex === dateIndexes.length - 1
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {points[index]?.date.slice(5).replace("-", "/")}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div
        id={descriptionId}
        aria-live="polite"
        className="mt-4 flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500 tabular-nums"
      >
        {active ? (
          <>
            <time dateTime={active.date}>{active.date}</time>
            {series.map((item) => (
              <span key={item.key}>
                {item.label}{" "}
                <strong className="font-medium text-slate-800">
                  {active[item.key].toLocaleString("zh-CN")}
                </strong>
              </span>
            ))}
          </>
        ) : null}
      </div>
    </figure>
  );
}

export function TrendPanel({
  data,
  error,
  loading,
  range,
  onRangeChange,
}: {
  data: DashboardTrends | null;
  error: string | null;
  loading: boolean;
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
}) {
  const actions = (
    <div
      aria-label="趋势时间范围"
      className="inline-flex rounded-xl border border-slate-200 bg-slate-50/80 p-1"
    >
      {(["7d", "30d", "90d"] as const).map((item) => (
        <button
          aria-pressed={range === item}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${range === item ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-sky-700"}`}
          key={item}
          onClick={() => onRangeChange(item)}
          type="button"
        >
          {item.slice(0, -1)} 天
        </button>
      ))}
    </div>
  );
  return (
    <DashboardPanel
      actions={actions}
      description="查看每日新增与教学活动，支持 7 天、30 天和 90 天趋势。"
      title="业务趋势"
    >
      {loading && !data ? (
        <SectionLoading label="正在读取趋势数据" />
      ) : error && !data ? (
        <SectionError message={error} />
      ) : !data ||
        data.points.every(
          (point) =>
            point.users +
              point.assignments +
              point.submissions +
              point.answers ===
            0,
        ) ? (
        <SectionEmpty message="当前时间范围内暂无用户、作业、提交或答题记录。" />
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          <TrendChart
            key={`publishing-${data.range}`}
            points={data.points}
            series={[
              { key: "users", label: "新增用户", color: "#4f7fbd" },
              {
                key: "assignments",
                label: "发布作业",
                color: "#bd8545",
              },
            ]}
            title="用户与作业发布"
          />
          <TrendChart
            key={`learning-${data.range}`}
            points={data.points}
            series={[
              {
                key: "submissions",
                label: "作业提交",
                color: "#358f83",
              },
              { key: "answers", label: "答题记录", color: "#9672b1" },
            ]}
            title="提交与答题"
          />
        </div>
      )}
      {data && !error ? (
        <p className="mt-3 text-xs text-slate-500" role="status">
          {loading
            ? "正在更新趋势…"
            : "按北京时间逐日统计，无记录日期显示为 0；图例数字为本时段合计。"}
        </p>
      ) : null}
      {error && data ? (
        <p className="mt-3 text-xs text-amber-700">
          刷新失败，当前显示上一次成功数据。
        </p>
      ) : null}
    </DashboardPanel>
  );
}
