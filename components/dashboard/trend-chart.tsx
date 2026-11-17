export interface TrendPoint {
  label: string;
  value: number;
  detail?: string;
}

interface TrendChartProps {
  points: TrendPoint[];
  emptyMessage: string;
  ariaLabel?: string;
  caption?: string;
  showDetails?: boolean;
}

export function TrendChart({
  points,
  emptyMessage,
  ariaLabel = "近期成绩趋势",
  caption,
  showDetails = false,
}: TrendChartProps) {
  if (points.length === 0) {
    return (
      <div className="text-muted-foreground flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      <div
        className="flex min-h-52 w-full min-w-0 items-end gap-2 overflow-x-auto pt-8 pb-2"
        role="img"
        aria-label={ariaLabel}
      >
        {points.map((point, index) => (
          <div
            className="flex min-w-12 flex-1 flex-col items-center"
            key={`${point.label}-${index}`}
            title={point.detail ?? `${point.label}：${point.value}%`}
          >
            <span className="mb-2 text-xs font-medium">{point.value}%</span>
            <div className="bg-muted flex h-32 w-10 items-end rounded-md px-1 sm:w-12">
              <div
                className="bg-brand w-full rounded-sm transition-[height]"
                style={{
                  height: `${Math.max(0, Math.min(100, point.value))}%`,
                }}
                title={point.detail ?? `${point.label}：${point.value}%`}
              />
            </div>
            <span className="text-muted-foreground mt-2 truncate text-xs">
              {point.label}
            </span>
          </div>
        ))}
      </div>
      <p className="text-ink-soft mt-2 text-xs leading-5">
        {caption ??
          `仅统计已有百分比成绩的 ${points.length} 条记录；未评估或待批改不按 0 分计算。`}
      </p>
      {showDetails ? (
        <details className="border-line bg-muted/60 mt-3 rounded-lg border px-3 py-2 text-xs">
          <summary className="text-brand-strong cursor-pointer font-medium">
            查看 {points.length} 条数据的来源与时间
          </summary>
          <ol className="text-ink-soft mt-2 space-y-2">
            {points.map((point, index) => (
              <li key={index} className="leading-5">
                <strong className="text-ink mr-2 tabular-nums">
                  {point.value}%
                </strong>
                {point.detail ?? point.label}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
