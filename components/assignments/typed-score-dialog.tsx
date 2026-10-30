"use client";

import { useState } from "react";
import type { QuestionType } from "@prisma/client";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import {
  distributePointsByType,
  groupQuestionsByType,
} from "@/services/assignments/editor-helpers";
import { EditorDialog } from "./editor-dialog";

type Question = {
  id: string;
  title: string;
  type: QuestionType;
  points: number;
};

export function TypedScoreDialog({
  questions,
  target,
  initiallyLocked,
  onApply,
  onClose,
}: {
  questions: Question[];
  target: number;
  initiallyLocked: string[];
  onApply: (points: number[], target: number, locked: string[]) => void;
  onClose: () => void;
}) {
  const groups = [...groupQuestionsByType(questions)];
  const [goal, setGoal] = useState(String(target));
  const [subtotals, setSubtotals] = useState(() =>
    Object.fromEntries(
      groups.map(([type, items]) => [
        type,
        String(
          Math.round(items.reduce((sum, item) => sum + item.points, 0) * 100) /
            100,
        ),
      ]),
    ),
  );
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
  const total =
    Math.round(
      Object.values(subtotals).reduce(
        (sum, value) => sum + (Number(value) || 0),
        0,
      ) * 100,
    ) / 100;
  return (
    <EditorDialog open title="按题型配分" onClose={onClose}>
      <div className="mt-4 space-y-4 text-sm">
        <p className="text-slate-600">
          填写每种题型的小计。同题型未锁定题目均分，尾差按题序分配。
        </p>
        <label className="flex items-center gap-2">
          目标总分
          <input
            type="number"
            min="0.01"
            max="10000"
            step="0.01"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="h-10 w-24 rounded-lg border px-2"
          />
        </label>
        <ul className="divide-y rounded-lg border">
          {groups.map(([type, items]) => (
            <li
              key={type}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <div>
                <p className="font-medium">{QUESTION_TYPE_LABELS[type]}</p>
                <p className="text-xs text-slate-600">
                  {items.length} 题
                  {points
                    ? ` · 单题 ${[...new Set(items.map((q) => points?.[questions.indexOf(q)]))].join("／")} 分`
                    : ""}
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
                  onChange={(e) =>
                    setSubtotals({ ...subtotals, [type]: e.target.value })
                  }
                  className="h-10 w-24 rounded-lg border px-2 text-sm"
                />
              </label>
            </li>
          ))}
        </ul>
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
        <p
          aria-live="polite"
          className={message ? "text-rose-800" : "text-emerald-800"}
        >
          已分配 {total} / {goal || "—"} 分。{message}
        </p>
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
