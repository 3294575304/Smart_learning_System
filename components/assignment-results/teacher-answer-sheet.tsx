"use client";

import { PanelRight } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import type { QuestionType } from "@prisma/client";
import {
  AnswerSheetPanel,
  type AnswerSheetQuestion,
  type AnswerSheetState,
} from "@/components/assignments/answer-sheet-panel";
import { EditorDialog } from "@/components/assignments/editor-dialog";
import {
  QUESTION_TYPE_GROUPS,
  QUESTION_TYPE_LABELS,
} from "@/services/questions/constants";

export function AnswerSheetFilters<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<readonly [T, string, number]>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-2 text-xs font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([key, name, count]) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === value}
            disabled={count === 0 && key !== value}
            onClick={() => onChange(key)}
            className="min-h-9 rounded-md border border-sky-200 px-2.5 text-xs font-medium tabular-nums hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50 aria-pressed:border-sky-600 aria-pressed:bg-sky-100 aria-pressed:text-sky-900"
          >
            {name} {count}
          </button>
        ))}
      </div>
    </div>
  );
}

export type AnswerSheetType = QuestionType | "ALL";

export function answerSheetTypeOptions(questions: { type: QuestionType }[]) {
  const options: Array<[AnswerSheetType, string, number]> = [
    ["ALL", "全部题型", questions.length],
  ];
  for (const { types } of QUESTION_TYPE_GROUPS) {
    for (const type of types) {
      const count = questions.filter(
        (question) => question.type === type,
      ).length;
      if (count) options.push([type, QUESTION_TYPE_LABELS[type], count]);
    }
  }
  return options;
}

const previewState = {
  label: "试卷题目",
  className:
    "border-line bg-white text-ink-soft hover:border-sky-400 hover:bg-sky-50",
};
const previewLegend = [
  { label: "题号", className: "border border-line bg-white" },
  { label: "当前题", className: "bg-brand" },
];

export function TeacherAnswerSheet({
  questions,
  total,
  totalPoints,
  answeredCount,
  answeredIds,
  questionState,
  filters,
  targetPrefix,
}: {
  questions: AnswerSheetQuestion[];
  total: number;
  totalPoints?: number;
  answeredCount?: number;
  answeredIds?: string[];
  questionState?: (index: number) => AnswerSheetState;
  filters?: ReactNode;
  targetPrefix: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const jump = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const answered = answeredIds ? new Set(answeredIds) : undefined;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-controls={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed top-[38%] right-0 z-40 inline-flex w-9 -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-sky-200 bg-white py-3 text-xs font-medium text-sky-800 shadow-sm transition-colors hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      >
        <PanelRight className="size-4" aria-hidden="true" />
        <span className="leading-5 tracking-widest [writing-mode:vertical-rl]">
          答题卡
        </span>
      </button>
      <EditorDialog
        open={open}
        title="答题卡"
        placement="right"
        dialogId={id}
        showCloseButton
        onClose={() => setOpen(false)}
        onAfterClose={() => {
          const target = jump.current && document.getElementById(jump.current);
          jump.current = null;
          if (target) {
            const url = new URL(window.location.href);
            url.hash = target.id;
            window.history.replaceState(window.history.state, "", url);
            target.scrollIntoView({ block: "start" });
            target.focus({ preventScroll: true });
          } else {
            trigger.current?.focus({ preventScroll: true });
          }
        }}
      >
        <AnswerSheetPanel
          questions={questions}
          totalQuestionCount={total}
          totalPoints={totalPoints}
          answeredCount={answeredCount}
          progressLabel="已作答"
          activeIndex={questions.findIndex(({ id }) => id === current)}
          isAnswered={answered ? (id) => answered.has(id) : undefined}
          questionState={
            questionState ?? (answered ? undefined : () => previewState)
          }
          legendItems={answeredCount === undefined ? previewLegend : undefined}
          filters={
            filters ? (
              <div className="mt-4 space-y-3">{filters}</div>
            ) : undefined
          }
          groupByType="type"
          showTitle={false}
          className="mt-4 border-0 bg-transparent p-0 shadow-none"
          onSelect={(index) => {
            const { id } = questions[index];
            setCurrent(id);
            jump.current = `${targetPrefix}${id}`;
            setOpen(false);
          }}
        />
      </EditorDialog>
    </>
  );
}
