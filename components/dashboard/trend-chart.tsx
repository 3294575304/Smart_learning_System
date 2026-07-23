export interface TrendPoint {
  label: string;
  value: number;
  detail?: string;
}

interface TrendChartProps {
  points: TrendPoint[];
  emptyMessage: string;
}

export function TrendChart({ points, emptyMessage }: TrendChartProps) {
  if (points.length === 0) {
    return (
      <div className="text-muted-foreground flex min-h-48 items-center justify-center rounded-lg border border-dashed text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-52 items-end gap-2 overflow-x-auto pt-8"
      role="img"
      aria-label="近期成绩趋势"
    >
      {points.map((point, index) => (
        <div
          className="flex min-w-12 flex-1 flex-col items-center"
          key={`${point.label}-${index}`}
        >
          <span className="mb-2 text-xs font-medium">{point.value}%</span>
          <div className="flex h-32 w-10 items-end rounded-md bg-gray-100 px-1 sm:w-12">
            <div
              className="w-full rounded-sm bg-gray-800 transition-[height]"
              style={{ height: `${Math.max(4, Math.min(100, point.value))}%` }}
              title={point.detail ?? `${point.label}：${point.value}%`}
            />
          </div>
          <span className="text-muted-foreground mt-2 truncate text-xs">
            {point.label}
          </span>
        </div>
      ))}
    </div>
  );
}
