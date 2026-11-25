"use client";

import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { QuestionType } from "@prisma/client";
import {
  QuestionNumberGrid,
  groupQuestionsByType,
  questionNumberNeutralTone,
  type QuestionNumberItem,
} from "./question-number-grid";

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
 *
 * 只读场景（教师查看试卷、学生查看提交结果、教师批改）复用同一个面板：
 * - `plainNumbers` 关闭作答状态，只保留题型分段与题号；
 * - `showProgress` 在无可信完成度时隐藏进度条，避免「0 / N」误导。
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
  plainNumbers = false,
  showProgress = true,
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
  plainNumbers?: boolean;
  showProgress?: boolean;
}) {
  const titleId = useId();
  const total = questions.length;
  const percent = total === 0 ? 0 : Math.round((answeredCount / total) * 100);
  const ordered = groupByType
    ? questions
    : questions.map((question) => ({ ...question, type: undefined }));
  const gridGroups = groupQuestionsByType(ordered).map((group) => ({
    key: group.key,
    type: group.type,
    items: ordered
      .slice(group.start, group.end)
      .map((question, offset): QuestionNumberItem => {
        const index = group.start + offset;
        const current = index === activeIndex;
        const answered = isAnswered?.(question.id);
        const state = plainNumbers
          ? { label: "题目", className: questionNumberNeutralTone }
          : (questionState?.(index) ?? {
              label: answered ? "已作答" : "未作答",
              className: answered
                ? "bg-brand-soft text-brand-strong border-sky-200 hover:border-sky-300"
                : "border-line text-ink-soft bg-white hover:border-sky-300 hover:bg-sky-50/60",
            });
        return {
          id: question.id,
          label: question.sortOrder,
          ariaLabel: plainNumbers
            ? `第 ${question.sortOrder} 题`
            : `第 ${question.sortOrder} 题（${state.label}）`,
          title: plainNumbers ? undefined : state.label,
          toneClassName: state.className,
          mark: state.mark,
          current,
          disabled,
        };
      }),
  }));

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

      {showProgress && (
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
      )}

      {summary && (
        <div className="text-ink-soft mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5">
          {summary}
        </div>
      )}
      <QuestionNumberGrid
        ariaLabel="题目导航"
        className="mt-4"
        groups={gridGroups}
        onSelect={(questionId) => {
          const index = questions.findIndex(
            (question) => question.id === questionId,
          );
          if (index >= 0) onSelect(index);
        }}
      />

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
