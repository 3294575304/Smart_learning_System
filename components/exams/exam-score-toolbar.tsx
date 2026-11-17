"use client";

import { Eraser, ListOrdered } from "lucide-react";

export type ExamScoreAction = "typed" | "weights" | "byType" | "even";
export type ExamScoreMode = ExamScoreAction | "custom";

const MODE_LABELS: Record<ExamScoreMode, string> = {
  typed: "按题型设总分",
  weights: "按权重推荐",
  byType: "各题型等额",
  even: "全卷均分",
  custom: "自定义配分",
};

const DISTRIBUTE_MODES: Array<{
  value: Exclude<ExamScoreAction, "byType">;
  label: string;
  hint: string;
}> = [
  {
    value: "typed",
    label: "按题型设总分",
    hint: "设置各题型的总分，预览每题分值后应用。",
  },
  {
    value: "weights",
    label: "按权重推荐",
    hint: "根据当前题型权重填入一份可编辑的配分方案。",
  },
  {
    value: "even",
    label: "全卷均分",
    hint: "所有题目平均分，不区分题型。",
  },
];

const CONTROL =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50 disabled:hover:bg-white";

function formatPoints(value: number) {
  return Number(value.toFixed(2));
}

export function ExamScoreToolbar({
  questionCount,
  busy,
  totalPoints,
  targetPoints,
  fixedTarget,
  mode,
  message,
  onTargetChange,
  onOrganize,
  onDistribute,
  onClear,
}: {
  questionCount: number;
  busy: boolean;
  totalPoints: number;
  targetPoints: number;
  fixedTarget: boolean;
  mode: ExamScoreMode;
  message: { text: string; tone: "info" | "warn" } | null;
  onTargetChange: (value: number) => void;
  onOrganize: () => void;
  onDistribute: (mode: ExamScoreAction) => void;
  onClear: () => void;
}) {
  const disabled = questionCount === 0 || busy;
  const mismatch =
    questionCount > 0 && Math.abs(totalPoints - targetPoints) > 0.005;
  const tone = message?.tone ?? (mismatch ? "warn" : "info");
  const statusText =
    message?.text ??
    (mismatch
      ? `当前 ${formatPoints(totalPoints)} / 目标 ${formatPoints(targetPoints)} 分`
      : `共 ${questionCount} 题 · 合计 ${formatPoints(totalPoints)} 分`);

  return (
    <div className="border-border bg-muted/30 mt-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={CONTROL}
          disabled={disabled}
          onClick={onOrganize}
        >
          <ListOrdered aria-hidden="true" className="size-4" />
          按题型整理
        </button>
        <span
          aria-hidden="true"
          className="bg-border hidden h-5 w-px sm:block"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          {fixedTarget ? "固定满分" : "目标总分"}
          <input
            type="number"
            min="0.01"
            max="10000"
            step="0.01"
            inputMode="decimal"
            aria-label={fixedTarget ? "固定满分" : "目标总分"}
            className="h-10 w-20 rounded-lg border bg-white px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            value={Number.isFinite(targetPoints) ? targetPoints : ""}
            readOnly={fixedTarget}
            onChange={(event) => onTargetChange(Number(event.target.value))}
          />
        </label>
        <div
          role="group"
          aria-label="配分方式"
          className="inline-flex w-full min-w-0 rounded-lg border bg-slate-100 p-0.5 sm:w-auto sm:flex-none"
        >
          {DISTRIBUTE_MODES.map((item) => (
            <button
              key={item.value}
              id={
                item.value === "typed" ? "exam-type-score-trigger" : undefined
              }
              type="button"
              aria-pressed={mode === item.value}
              title={item.hint}
              aria-label={`${item.label}：${item.hint}`}
              disabled={disabled}
              onClick={() => onDistribute(item.value)}
              className={`min-h-9 min-w-0 flex-1 rounded-md px-1.5 text-[13px] font-medium whitespace-nowrap transition-colors disabled:opacity-50 sm:px-2.5 sm:text-sm ${
                mode === item.value
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <details className="relative text-xs text-slate-600">
          <summary className="cursor-pointer rounded px-2 py-2 hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700">
            更多配分
          </summary>
          <button
            type="button"
            className={CONTROL}
            disabled={disabled}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              onDistribute("byType");
            }}
          >
            各题型等额
          </button>
        </details>
        <button
          type="button"
          className="ms-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 disabled:hover:bg-white"
          disabled={disabled}
          onClick={onClear}
        >
          <Eraser aria-hidden="true" className="size-4" />
          清空
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border bg-white px-2 py-0.5 font-medium text-slate-700">
          {MODE_LABELS[mode]}
        </span>
        <span
          role="status"
          className={tone === "warn" ? "text-amber-800" : "text-slate-600"}
        >
          {statusText}
        </span>
      </div>
    </div>
  );
}
