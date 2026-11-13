"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface AnswerSheetQuestion {
  id: string;
  sortOrder: number;
}

const legend = [
  { label: "已作答", className: "border border-sky-200 bg-brand-soft" },
  { label: "未作答", className: "border border-line bg-white" },
  { label: "当前题", className: "bg-brand" },
] as const;

/**
 * 答题卡（重设计）。
 *
 * 设计要点：
 * 1. 题号格用「已作答 / 未作答 / 当前题」三种状态，学生一眼能看出漏答；
 * 2. 顶部给「已完成 x / y」和百分比进度条，比单看格子更快判断整体；
 * 3. 提交类主操作放在面板底部——正文区只保留翻页，避免出现第二个主按钮。
 *
 * 桌面端常驻右侧栏，移动端同一组件塞进底部抽屉，行为完全一致。
 */
export function AnswerSheetPanel({
  questions,
  activeIndex,
  isAnswered,
  onSelect,
  disabled = false,
  answeredCount,
  totalPoints,
  footer,
  className,
  showTitle = true,
}: {
  questions: AnswerSheetQuestion[];
  activeIndex: number;
  isAnswered: (questionId: string) => boolean;
  onSelect: (index: number) => void;
  disabled?: boolean;
  answeredCount: number;
  totalPoints?: number;
  footer?: ReactNode;
  className?: string;
  showTitle?: boolean;
}) {
  const titleId = useId();
  const total = questions.length;
  const percent = total === 0 ? 0 : Math.round((answeredCount / total) * 100);

  return (
    <section
      aria-labelledby={showTitle ? titleId : undefined}
      className={cn(
        "border-line bg-card rounded-xl border p-5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {showTitle && (
          <h2 id={titleId} className="text-ink text-sm font-semibold">
            答题卡
          </h2>
        )}
        <span className="bg-muted text-ink-soft rounded-md px-2 py-0.5 text-[11px] leading-5 font-medium">
          {total} 题{totalPoints ? ` · ${totalPoints} 分` : ""}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-ink-soft font-medium">
            已完成 {answeredCount} / {total}
          </span>
          <span className="text-brand font-semibold tabular-nums">
            {percent}%
          </span>
        </div>
        <div
          aria-hidden="true"
          className="h-1.5 w-full overflow-hidden rounded-full bg-[#eaf1f7]"
        >
          <div
            className="bg-brand h-full rounded-full transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <nav aria-label="题目导航" className="mt-4 grid grid-cols-5 gap-2">
        {questions.map((question, index) => {
          const current = index === activeIndex;
          const answered = isAnswered(question.id);
          return (
            <button
              aria-current={current ? "step" : undefined}
              aria-label={`第 ${question.sortOrder} 题${answered ? "（已作答）" : "（未作答）"}`}
              className={cn(
                "flex h-10 items-center justify-center rounded-lg border text-[13px] font-medium tabular-nums transition-colors",
                "focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-2",
                current
                  ? "border-brand bg-brand text-white shadow-[0_3px_8px_-1px_rgb(1_105_161_/_0.3)]"
                  : answered
                    ? "bg-brand-soft text-brand-strong border-sky-200 hover:border-sky-300"
                    : "border-line text-ink-soft bg-white hover:border-sky-300 hover:bg-sky-50/60",
                disabled &&
                  "hover:border-line cursor-not-allowed opacity-60 hover:bg-white",
              )}
              disabled={disabled}
              key={question.id}
              onClick={() => onSelect(index)}
              type="button"
            >
              {question.sortOrder}
            </button>
          );
        })}
      </nav>

      <ul className="text-ink-soft mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
        {legend.map((item) => (
          <li className="inline-flex items-center gap-1.5" key={item.label}>
            <span
              aria-hidden="true"
              className={cn("size-2.5 rounded-[3px]", item.className)}
            />
            {item.label}
          </li>
        ))}
      </ul>

      {footer ? (
        <div className="border-line-soft mt-4 space-y-2 border-t pt-4">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
