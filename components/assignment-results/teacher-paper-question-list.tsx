"use client";

import type { QuestionType } from "@prisma/client";
import { PanelRight } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { EditorDialog } from "@/components/assignments/editor-dialog";
import {
  QUESTION_TYPE_GROUPS,
  QUESTION_TYPE_LABELS,
} from "@/services/questions/constants";

export function TeacherPaperQuestionList({
  questions,
}: {
  questions: {
    id: string;
    order: number;
    type: QuestionType;
    content: ReactNode;
  }[];
}) {
  const [filter, setFilter] = useState<QuestionType | "ALL">("ALL");
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const jumpTarget = useRef<string | null>(null);
  const shown =
    filter === "ALL"
      ? questions
      : questions.filter((question) => question.type === filter);
  const filters = [
    { value: "ALL" as const, label: "全部", count: questions.length },
    ...QUESTION_TYPE_GROUPS.flatMap(({ types }) => types).map((type) => ({
      value: type,
      label: QUESTION_TYPE_LABELS[type],
      count: questions.filter((question) => question.type === type).length,
    })),
  ];

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-controls={open ? dialogId : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed top-[38%] right-0 z-40 inline-flex w-9 -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-sky-200 bg-white py-3 text-xs font-medium text-sky-800 shadow-sm transition-colors hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
      >
        <PanelRight className="size-4" aria-hidden="true" />
        <span className="leading-5 tracking-widest [writing-mode:vertical-rl]">
          题号导航
        </span>
      </button>
      {filter !== "ALL" && (
        <div
          className="flex flex-wrap items-center gap-3 text-sm text-slate-600"
          role="status"
        >
          <span>
            {QUESTION_TYPE_LABELS[filter]} · {shown.length} 道题
          </span>
          <button
            type="button"
            className="text-sky-700 underline"
            onClick={() => setFilter("ALL")}
          >
            查看全部
          </button>
        </div>
      )}
      <div className="min-w-0 space-y-3">
        {shown.map((question) => (
          <div
            key={question.id}
            id={`paper-question-${question.id}`}
            tabIndex={-1}
            className="scroll-mt-20 rounded-xl focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            {question.content}
          </div>
        ))}
      </div>
      <EditorDialog
        open={open}
        title="题号与筛选"
        placement="right"
        dialogId={dialogId}
        showCloseButton
        onClose={() => setOpen(false)}
        onAfterClose={() => {
          const target = jumpTarget.current
            ? document.getElementById(jumpTarget.current)
            : null;
          jumpTarget.current = null;
          if (target) {
            target.scrollIntoView({ block: "start" });
            target.focus({ preventScroll: true });
          } else {
            trigger.current?.focus({ preventScroll: true });
          }
        }}
      >
        <div className="mt-4 space-y-5">
          <div
            role="group"
            aria-label="按题型筛选"
            className="flex flex-wrap gap-2"
          >
            {filters.map(({ value, label, count }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                disabled={count === 0}
                onClick={() => setFilter(value)}
                className="min-h-10 rounded-lg border px-3 text-xs font-medium tabular-nums hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 aria-pressed:border-sky-500 aria-pressed:bg-sky-100 aria-pressed:text-sky-900"
              >
                {label} {count}
              </button>
            ))}
          </div>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">题号</h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {shown.length} / {questions.length}
              </span>
            </div>
            <nav aria-label="题号导航" className="mt-3 grid grid-cols-5 gap-2">
              {shown.map((question) => (
                <button
                  key={question.id}
                  type="button"
                  aria-label={`跳转到第 ${question.order} 题，${QUESTION_TYPE_LABELS[question.type]}`}
                  className="flex h-11 items-center justify-center rounded-lg border bg-slate-50 text-sm font-medium text-slate-700 tabular-nums hover:border-sky-400 hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500"
                  onClick={() => {
                    jumpTarget.current = `paper-question-${question.id}`;
                    setOpen(false);
                  }}
                >
                  {question.order}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </EditorDialog>
    </>
  );
}
