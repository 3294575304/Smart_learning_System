import {
  outcomeLabels,
  type AnswerOutcome,
} from "@/services/assignments/personal-work-presentation";

import type { AnswerSheetState } from "./answer-sheet-panel";

/**
 * 答题卡题号状态的统一样式表。
 *
 * 学生作答、学生查看结果、教师批改三处共用同一套配色，
 * 避免同一种结论在不同页面换一种颜色。
 */
const tone = {
  correct: "border-emerald-200 bg-emerald-50 text-emerald-800",
  wrong: "border-rose-200 bg-rose-50 text-rose-900",
  partial: "border-amber-200 bg-amber-50 text-amber-900",
  pending: "border-violet-200 bg-violet-50 text-violet-900",
  submitted: "border-sky-200 bg-sky-50 text-sky-900",
  empty: "border-line text-ink-soft bg-white",
} as const;

export const answerCardStateTone = tone;

/** 教师批改：按每题批改结论上色，图例与正文 StatusChip 用词一致。 */
export function gradingAnswerCardState(outcome: AnswerOutcome): AnswerSheetState {
  const label = outcomeLabels[outcome];
  switch (outcome) {
    case "CORRECT":
      return { label, className: tone.correct };
    case "WRONG":
      return { label, className: tone.wrong };
    case "PARTIAL":
      return { label, className: tone.partial };
    case "MISSING":
      return { label, className: tone.empty };
    default:
      return { label, className: tone.pending };
  }
}

export const gradingAnswerCardLegend: readonly AnswerSheetState[] = [
  { label: "答对", className: tone.correct },
  { label: "答错", className: tone.wrong },
  { label: "部分得分", className: tone.partial },
  { label: "待处理", className: tone.pending },
];

/** 学生查看结果：成绩未公布时只区分是否已作答，公布后按得分结论上色。 */
export function studentResultAnswerCardState(
  graded: { score: number | null; isCorrect: boolean | null } | null | undefined,
): AnswerSheetState {
  if (!graded) return { label: "已提交", className: tone.submitted };
  if (graded.score === null) return { label: "待批改", className: tone.pending };
  if (graded.isCorrect === true) return { label: "满分", className: tone.correct };
  if (graded.score === 0) return { label: "未得分", className: tone.wrong };
  return { label: "部分得分", className: tone.partial };
}

export const studentResultAnswerCardLegend: readonly AnswerSheetState[] = [
  { label: "满分", className: tone.correct },
  { label: "部分得分", className: tone.partial },
  { label: "未得分", className: tone.wrong },
  { label: "待批改", className: tone.pending },
  { label: "已提交", className: tone.submitted },
];
