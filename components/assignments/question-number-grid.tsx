"use client";

import type { QuestionType } from "@prisma/client";

import { cn } from "@/lib/utils";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";

/**
 * 题号网格（教师端「题号与筛选」与学生端「答题卡」共用）。
 *
 * 两端此前各写一套：学生端按题型分段、当前题用品牌色实心高亮；
 * 教师端只有一行平铺数字。合并成一个组件后，教师端选题区的分组、
 * 字号、圆角、hover 与学生端完全一致，后续改样式也不用改两处。
 */

/** 未作答/未查看的中性题号样式，与答题卡一致性最高。 */
export const questionNumberNeutralTone =
  "border-line text-ink-soft bg-white hover:border-sky-300 hover:bg-sky-50/60";

export interface QuestionNumberItem {
  id: string;
  /** 按钮文案，通常是题号 */
  label: number;
  /** 无障碍名称与 tooltip 兜底 */
  ariaLabel: string;
  /** tooltip；缺省时用 ariaLabel */
  title?: string;
  /** 状态样式覆盖，缺省用中性样式 */
  toneClassName?: string;
  /** 题号右侧的小角标，例如已作答标记 */
  mark?: string;
  current?: boolean;
  disabled?: boolean;
}

export interface QuestionNumberGroup {
  /** 分组键，取组内首题 id，保证 React key 稳定 */
  key: string;
  /** 题型；缺省时不渲染分组标题 */
  type?: QuestionType;
  items: QuestionNumberItem[];
}

/**
 * 按**相邻**题型切段，不重排题序。
 *
 * 与答题卡的历史行为保持一致：题型交替的试卷会出现同名分段，
 * 但题号顺序永远与正文一致，跳题不会错位。
 */
export function groupQuestionsByType<
  T extends { id: string; type?: QuestionType },
>(
  questions: readonly T[],
): Array<{ key: string; type?: QuestionType; start: number; end: number }> {
  const groups: Array<{
    key: string;
    type?: QuestionType;
    start: number;
    end: number;
  }> = [];
  questions.forEach((question, index) => {
    const previous = groups[groups.length - 1];
    if (previous && previous.type === question.type) previous.end = index + 1;
    else
      groups.push({
        key: question.id,
        type: question.type,
        start: index,
        end: index + 1,
      });
  });
  return groups;
}

export function QuestionNumberGrid({
  groups,
  onSelect,
  ariaLabel = "题号导航",
  className,
}: {
  groups: QuestionNumberGroup[];
  onSelect: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("space-y-4", className)}>
      {groups.map((group) => (
        <div key={group.key}>
          {group.type ? (
            <h3 className="text-ink-soft mb-2 text-xs font-medium">
              {QUESTION_TYPE_LABELS[group.type]} · {group.items.length} 题
            </h3>
          ) : null}
          <div className="grid grid-cols-5 gap-2">
            {group.items.map((item) => (
              <button
                key={item.id}
                aria-current={item.current ? "step" : undefined}
                aria-label={item.ariaLabel}
                title={item.title ?? item.ariaLabel}
                className={cn(
                  "flex h-10 items-center justify-center gap-0.5 rounded-lg border text-[13px] font-medium tabular-nums transition-colors",
                  "focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-2",
                  item.current
                    ? "border-brand bg-brand text-white shadow-[0_3px_8px_-1px_rgb(1_105_161_/_0.3)]"
                    : (item.toneClassName ?? questionNumberNeutralTone),
                  item.disabled &&
                    "hover:border-line cursor-not-allowed opacity-60 hover:bg-white",
                )}
                disabled={item.disabled}
                onClick={() => onSelect(item.id)}
                type="button"
              >
                {item.label}
                {item.mark ? (
                  <span aria-hidden="true" className="text-[10px]">
                    {item.mark}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
