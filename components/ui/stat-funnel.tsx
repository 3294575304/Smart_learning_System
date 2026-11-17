import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Each stage uses the preceding stage's count as its denominator. */
export type FunnelStep = {
  key: string;
  label: string;
  numerator: number;
  denominator: number;
  /** 分母为零时使用 null，显示暂无数据。 */
  value: number | null;
  detail: string;
};

export function StatFunnel({
  steps,
  caption,
  dots,
  action,
  className,
}: {
  steps: FunnelStep[];
  caption?: ReactNode;
  /** 知识点点阵：用格子数量表达"还剩几个没掌握"，比裸数字更容易感知。 */
  dots?: { total: number; filled: number; caption: string };
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <ol className="grid gap-x-6 gap-y-4 md:grid-cols-3">
        {steps.map((step) => {
          const percent =
            step.value === null
              ? null
              : Math.max(0, Math.min(100, Math.round(step.value)));
          return (
            <li className="min-w-0" key={step.key}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-ink-soft min-w-0 text-xs">
                  {step.label}
                </span>
              </div>
              <p className="mt-1.5 flex items-baseline gap-1 tabular-nums">
                <span className="text-ink text-[22px] leading-none font-semibold">
                  {step.numerator}
                </span>
                <span className="text-ink-soft text-xs">
                  / {step.denominator}
                </span>
              </p>
              <div
                aria-hidden="true"
                className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
              >
                <div
                  className="bg-brand h-full rounded-full"
                  style={{ width: `${percent ?? 0}%` }}
                />
              </div>
              <p className="text-ink-soft mt-1.5 text-xs tabular-nums">
                {percent === null ? "暂无数据" : `${percent}%`}
              </p>
              <p className="text-ink-soft mt-1 text-xs leading-5">
                {step.detail}
              </p>
            </li>
          );
        })}
      </ol>

      {dots && dots.total > 0 ? (
        <div className="border-line mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3">
          <ul aria-hidden="true" className="flex flex-wrap gap-1">
            {Array.from({ length: Math.min(dots.total, 80) }, (_, index) => (
              <li
                key={index}
                className={cn(
                  "size-2.5 rounded-[2px]",
                  index < dots.filled ? "bg-ok" : "border-line border",
                )}
              />
            ))}
          </ul>
          <p className="text-ink-soft min-w-0 text-xs leading-5">
            {dots.caption}
          </p>
        </div>
      ) : null}

      {(caption || action) && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <p className="text-ink-soft max-w-[52ch] min-w-0 text-xs leading-5">
            {caption}
          </p>
          {action}
        </div>
      )}
    </div>
  );
}
