"use client";

import { useState } from "react";
import type { QuestionType } from "@prisma/client";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import {
  distributePointsByType,
  groupQuestionsByType,
} from "@/services/assignments/editor-helpers";
import { EditorDialog } from "./editor-dialog";
import { distributeEvenPoints } from "@/services/questions/score-distribution";

type Question = {
  id: string;
  title: string;
  type: QuestionType;
  points: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function TypedScoreDialog({
  questions,
  target,
  initiallyLocked,
  onApply,
  onClose,
  exam,
}: {
  questions: Question[];
  target: number;
  initiallyLocked: string[];
  onApply: (points: number[], target: number, locked: string[]) => void;
  onClose: () => void;
  exam?: {
    fixedTarget: boolean;
    preset: "current" | "weights" | "byType";
    initialSubtotals?: Partial<Record<QuestionType, number>>;
    recommend: (goal: number) => Partial<Record<QuestionType, number>>;
  };
}) {
  const groups = [...groupQuestionsByType(questions)];
  const [goal, setGoal] = useState(String(target));
  const [subtotals, setSubtotals] = useState(() => {
    let initial = exam?.initialSubtotals;
    try {
      if (exam?.preset === "weights") initial = exam.recommend(target);
      if (exam?.preset === "byType") {
        const points = distributeEvenPoints(groups.length, target);
        initial = Object.fromEntries(
          groups.map(([type], index) => [type, points[index]]),
        );
      }
    } catch {
      // Keep the current subtotals when the target cannot be allocated.
    }
    return Object.fromEntries(
      groups.map(([type, items]) => [
        type,
        String(
          initial
            ? (initial[type] ?? 0)
            : round2(items.reduce((sum, item) => sum + item.points, 0)),
        ),
      ]),
    );
  });
  const [presetError, setPresetError] = useState("");
  const [locked, setLocked] = useState(initiallyLocked);
  let points: number[] | null = null;
  let message: string | null = null;
  try {
    points = distributePointsByType(
      questions,
      Number(goal),
      Object.fromEntries(
        groups.map(([type]) => [type, Number(subtotals[type])]),
      ),
      locked,
    );
  } catch (error) {
    message = error instanceof Error ? error.message : "请检查分值";
  }
  const total = round2(
    Object.values(subtotals).reduce(
      (sum, value) => sum + (Number(value) || 0),
      0,
    ),
  );
  const goalNumber = Number(goal);
  const diff =
    Number.isFinite(goalNumber) && goal.trim() !== ""
      ? round2(goalNumber - total)
      : null;

  /** 把小计一次性平均分给所有题型（题型数等分，尾差给前几个题型）。 */
  function fillEqualByType() {
    const types = groups.map(([type]) => type);
    const cents = Math.round(Number(goal) * 100);
    if (!types.length || !Number.isFinite(cents) || cents <= 0) return;
    const base = Math.floor(cents / types.length);
    const remainder = cents % types.length;
    setSubtotals(
      Object.fromEntries(
        types.map((type, index) => [
          type,
          String((base + (index < remainder ? 1 : 0)) / 100),
        ]),
      ),
    );
  }

  function fillRecommended() {
    if (!exam) return;
    try {
      const recommended = exam.recommend(Number(goal));
      setSubtotals(
        Object.fromEntries(
          groups.map(([type]) => [type, String(recommended[type] ?? 0)]),
        ),
      );
      setPresetError("");
    } catch (error) {
      setPresetError(error instanceof Error ? error.message : "请检查目标总分");
    }
  }

  function perQuestionLabel(type: QuestionType, items: Question[]) {
    const preview = points;
    let values = preview
      ? items.map((item) => preview[questions.indexOf(item)])
      : null;
    if (!values && exam) {
      const subtotal = Number(subtotals[type]);
      try {
        values = distributeEvenPoints(items.length, subtotal);
      } catch {
        /* The subtotal still needs editing. */
      }
    }
    if (!values) return "待配分";
    const min = round2(Math.min(...values));
    const max = round2(Math.max(...values));
    return min === max ? `每题 ${min} 分` : `${min}–${max} 分/题`;
  }

  return (
    <EditorDialog
      open
      title={exam ? "按题型设总分" : "自定义各题型分值"}
      onClose={onClose}
    >
      <div className="mt-4 space-y-4 text-sm">
        <p className="text-slate-600">
          {exam
            ? "设置各题型总分，查看每题分值后再应用。小数尾差按题序分配。"
            : "先定目标总分，再为每个题型分配小计。同题型未锁定题目按题数均分，尾差按题序分配。"}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2">
            目标总分
            <input
              type="number"
              min="0.01"
              max="10000"
              step="0.01"
              value={goal}
              readOnly={exam?.fixedTarget}
              onChange={(e) => {
                setGoal(e.target.value);
                setPresetError("");
              }}
              className="h-10 w-24 rounded-lg border px-2"
            />
          </label>
          {exam?.fixedTarget && (
            <span className="self-center text-xs text-slate-600">
              自动组卷固定 100 分
            </span>
          )}
          <button
            type="button"
            onClick={exam ? fillRecommended : fillEqualByType}
            className="h-10 rounded-lg border px-3 text-xs font-medium text-sky-800 transition hover:bg-sky-50 active:scale-[0.98]"
          >
            {exam ? "按权重填入建议" : "按题型平均分配"}
          </button>
        </div>
        <ul className="divide-y rounded-lg border">
          {groups.map(([type, items]) => (
            <li
              key={type}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <div>
                <p className="font-medium">
                  {QUESTION_TYPE_LABELS[type]}{" "}
                  <span className="text-xs font-normal text-slate-500">
                    {items.length} 题
                  </span>
                </p>
                <p className="text-xs text-slate-600">
                  {perQuestionLabel(type, items)}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs">
                小计
                <input
                  aria-label={`${QUESTION_TYPE_LABELS[type]}小计`}
                  type="number"
                  min="0.01"
                  max="10000"
                  step="0.01"
                  value={subtotals[type]}
                  onChange={(e) => {
                    setSubtotals({ ...subtotals, [type]: e.target.value });
                    setPresetError("");
                  }}
                  className="h-10 w-24 rounded-lg border px-2 text-sm"
                />
              </label>
            </li>
          ))}
        </ul>
        <p
          aria-live="polite"
          className={message ? "text-rose-800" : "text-emerald-800"}
        >
          已分配 {total} / {Number.isFinite(goalNumber) ? goalNumber : "—"} 分
          {diff === null
            ? ""
            : diff === 0
              ? " · 已平衡"
              : diff > 0
                ? ` · ${exam ? "剩余" : "还差"} ${diff} 分`
                : ` · 超出 ${Math.abs(diff)} 分`}
          。{presetError || message}
        </p>
        {!exam && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">
              锁定单题分值（已锁定{" "}
              {questions.filter((q) => locked.includes(q.id)).length} 题）
            </summary>
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
              {questions.map((q, index) => (
                <label
                  key={q.id}
                  className="flex items-start gap-2 rounded px-1 py-1.5 [overflow-wrap:anywhere]"
                >
                  <input
                    type="checkbox"
                    checked={locked.includes(q.id)}
                    onChange={(e) =>
                      setLocked(
                        e.target.checked
                          ? [...locked, q.id]
                          : locked.filter((id) => id !== q.id),
                      )
                    }
                    className="mt-1 shrink-0"
                  />
                  <span className="min-w-0">
                    {index + 1}. {q.title} · {q.points} 分
                  </span>
                </label>
              ))}
            </div>
          </details>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border px-4"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!points}
            onClick={() => {
              if (points) onApply(points, Number(goal), locked);
            }}
            className="h-10 rounded-lg bg-sky-700 px-4 text-white disabled:opacity-50"
          >
            应用分值
          </button>
        </div>
      </div>
    </EditorDialog>
  );
}
