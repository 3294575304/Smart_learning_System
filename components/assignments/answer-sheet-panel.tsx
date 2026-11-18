"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { QuestionType } from "@prisma/client";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";

export interface AnswerSheetQuestion {
  id: string;
  sortOrder: number;
  type?: QuestionType;
}

export interface AnswerSheetState {
  label: string;
  mark?: string;
  className: string;
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
 * 可按连续题型分段，保持试卷题序和原有跳题索引。
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
  questionState,
  progressLabel = "已完成",
  legendItems = legend,
  summary,
  groupByType = false,
}: {
  questions: AnswerSheetQuestion[];
  activeIndex: number;
  isAnswered?: (questionId: string) => boolean;
  questionState?: (index: number) => AnswerSheetState;
  onSelect: (index: number) => void;
  disabled?: boolean;
  answeredCount: number;
  totalPoints?: number;
  footer?: ReactNode;
  className?: string;
  showTitle?: boolean;
  progressLabel?: string;
  legendItems?: readonly AnswerSheetState[];
  summary?: ReactNode;
  groupByType?: boolean;
}) {
  const titleId = useId();
  const total = questions.length;
  const percent = total === 0 ? 0 : Math.round((answeredCount / total) * 100);
  const groups: Array<{ type?: QuestionType; start: number; end: number }> = [];
  questions.forEach((question, index) => {
    const type = groupByType ? question.type : undefined;
    const previous = groups[groups.length - 1];
    if (previous && previous.type === type) previous.end = index + 1;
    else groups.push({ type, start: index, end: index + 1 });
  });

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
          {total} 题
          {totalPoints ? ` · ${Number(totalPoints.toFixed(2))} 分` : ""}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-ink-soft font-medium">
            {progressLabel} {answeredCount} / {total}
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
            className="bg-brand h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {summary && (
        <div className="text-ink-soft mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5">
          {summary}
        </div>
      )}
      <nav aria-label="题目导航" className="mt-4 space-y-4">
        {groups.map(({ type, start, end }) => (
          <div key={start}>
            {type && (
              <h3 className="text-ink-soft mb-2 text-xs font-medium">
                {QUESTION_TYPE_LABELS[type]} · {end - start} 题
              </h3>
            )}
            <div className="grid grid-cols-5 gap-2">
              {questions.slice(start, end).map((question, offset) => {
                const index = start + offset;
                const current = index === activeIndex;
                const answered = isAnswered?.(question.id);
                const state = questionState?.(index) ?? {
                  label: answered ? "已作答" : "未作答",
                  className: answered
                    ? "bg-brand-soft text-brand-strong border-sky-200 hover:border-sky-300"
                    : "border-line text-ink-soft bg-white hover:border-sky-300 hover:bg-sky-50/60",
                };
                return (
                  <button
                    aria-current={current ? "step" : undefined}
                    aria-label={`第 ${question.sortOrder} 题（${state.label}）`}
                    title={state.label}
                    className={cn(
                      "flex h-10 items-center justify-center gap-0.5 rounded-lg border text-[13px] font-medium tabular-nums transition-colors",
                      "focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-2",
                      current
                        ? "border-brand bg-brand text-white shadow-[0_3px_8px_-1px_rgb(1_105_161_/_0.3)]"
                        : state.className,
                      disabled &&
                        "hover:border-line cursor-not-allowed opacity-60 hover:bg-white",
                    )}
                    disabled={disabled}
                    key={question.id}
                    onClick={() => onSelect(index)}
                    type="button"
                  >
                    {question.sortOrder}
                    {state.mark && (
                      <span aria-hidden="true" className="text-[10px]">
                        {state.mark}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <ul className="text-ink-soft mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px]">
        {legendItems.map((item) => (
          <li className="inline-flex items-center gap-1.5" key={item.label}>
            {item.mark ? (
              <span aria-hidden="true" className="font-semibold">
                {item.mark}
              </span>
            ) : (
              <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-[3px]", item.className)}
              />
            )}
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
