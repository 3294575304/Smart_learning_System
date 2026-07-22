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
  className: string;
}

function TrendBars({
  points,
  series,
  title,
}: {
  points: TrendPoint[];
  series: Series[];
  title: string;
}) {
  const maximum = Math.max(
    1,
    ...points.flatMap((point) => series.map((item) => point[item.key])),
  );
  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="flex flex-wrap gap-3 text-xs">
          {series.map((item) => (
            <span className="flex items-center gap-1" key={item.key}>
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-sm ${item.className}`}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto pb-2">
        <div
          className="flex h-52 min-w-full items-end gap-1 border-b px-1 pt-6"
          style={{ width: `${Math.max(640, points.length * 18)}px` }}
        >
          {points.map((point, index) => (
            <div
              className="flex h-full min-w-3 flex-1 flex-col justify-end"
              key={point.date}
            >
              <div className="flex h-40 items-end justify-center gap-px">
                {series.map((item) => {
                  const value = point[item.key];
                  return (
                    <span
                      aria-label={`${point.date} ${item.label} ${value}`}
                      className={`min-h-px w-1/2 rounded-t-sm ${item.className}`}
                      key={item.key}
                      role="img"
                      style={{
                        height:
                          value === 0
                            ? "1px"
                            : `${Math.max(3, (value / maximum) * 100)}%`,
                      }}
                      title={`${point.date} · ${item.label}：${value}`}
                    />
                  );
                })}
              </div>
              <span className="text-muted-foreground mt-2 h-4 text-center text-[10px]">
                {index === 0 ||
                index === points.length - 1 ||
                index % Math.ceil(points.length / 6) === 0
                  ? point.date.slice(5)
                  : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-muted-foreground mt-2 text-xs">
        单位：条；无记录日期按 0 展示，日期边界为 Asia/Shanghai。
      </figcaption>
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
    <div aria-label="趋势时间范围" className="flex rounded-lg border p-1">
      {(["7d", "30d", "90d"] as const).map((item) => (
        <button
          aria-pressed={range === item}
          className={`rounded-md px-3 py-1 text-xs font-medium ${range === item ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
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
      description="按上海时区日历日聚合，日期连续且不使用模拟趋势。"
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
        <div className="grid gap-8 xl:grid-cols-2">
          <TrendBars
            points={data.points}
            series={[
              { key: "users", label: "新增用户", className: "bg-blue-600" },
              {
                key: "assignments",
                label: "发布作业",
                className: "bg-slate-400",
              },
            ]}
            title="用户与作业发布"
          />
          <TrendBars
            points={data.points}
            series={[
              {
                key: "submissions",
                label: "作业提交",
                className: "bg-emerald-600",
              },
              { key: "answers", label: "答题记录", className: "bg-amber-500" },
            ]}
            title="提交与答题"
          />
        </div>
      )}
      {error && data ? (
        <p className="mt-3 text-xs text-amber-700">
          刷新失败，当前显示上一次成功数据。
        </p>
      ) : null}
    </DashboardPanel>
  );
}
