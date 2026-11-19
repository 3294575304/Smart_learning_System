"use client";

import { useState } from "react";
import type { QuestionType } from "@prisma/client";
import {
  AnswerSheetFilters,
  TeacherAnswerSheet,
  answerSheetTypeOptions,
  type AnswerSheetType,
} from "@/components/assignment-results/teacher-answer-sheet";
import type { AnswerSheetQuestion } from "@/components/assignments/answer-sheet-panel";
import type { PublishedReceiptOutcome } from "@/services/assignments/answer-presentation";

type ReceiptQuestion = AnswerSheetQuestion & {
  type: QuestionType;
  answered: boolean;
  outcome?: PublishedReceiptOutcome;
};

const outcomes = {
  CORRECT: { label: "答对", mark: "✓" },
  INCORRECT: { label: "答错", mark: "×" },
  PARTIAL: { label: "部分得分", mark: "½" },
  PENDING: { label: "待处理", mark: "…" },
} satisfies Record<PublishedReceiptOutcome, { label: string; mark: string }>;

export function ExamReceiptAnswerSheet({
  questions,
  totalPoints,
  published,
}: {
  questions: ReceiptQuestion[];
  totalPoints?: number;
  published: boolean;
}) {
  const [outcome, setOutcome] = useState<PublishedReceiptOutcome | "ALL">(
    "ALL",
  );
  const [status, setStatus] = useState<"ALL" | "ANSWERED" | "UNANSWERED">(
    "ALL",
  );
  const [type, setType] = useState<AnswerSheetType>("ALL");
  const answeredCount = questions.filter(({ answered }) => answered).length;
  const shown = questions.filter(
    (question) =>
      (!published || outcome === "ALL" || question.outcome === outcome) &&
      (status === "ALL" || question.answered === (status === "ANSWERED")) &&
      (type === "ALL" || question.type === type),
  );
  const types = answerSheetTypeOptions(questions);

  return (
    <TeacherAnswerSheet
      questions={shown}
      total={questions.length}
      totalPoints={totalPoints}
      answeredCount={answeredCount}
      targetPrefix="exam-question-"
      questionState={(index) => {
        const { answered, outcome } = shown[index];
        const result = published && outcome ? outcomes[outcome] : undefined;
        const statusLabel = answered ? "已作答" : "未作答";
        return {
          label: result ? `${statusLabel} · ${result.label}` : statusLabel,
          mark: result?.mark,
          className: answered
            ? "border-sky-200 bg-brand-soft text-brand-strong hover:border-sky-400"
            : "border-line bg-white text-ink-soft hover:border-sky-400",
        };
      }}
      filters={
        <>
          {published && (
            <AnswerSheetFilters<PublishedReceiptOutcome | "ALL">
              label="批改结果"
              value={outcome}
              options={[
                ["ALL", "全部结果", questions.length],
                ...Object.entries(outcomes).map(
                  ([key, { label }]) =>
                    [
                      key as PublishedReceiptOutcome,
                      label,
                      questions.filter((question) => question.outcome === key)
                        .length,
                    ] as const,
                ),
              ]}
              onChange={setOutcome}
            />
          )}
          <AnswerSheetFilters
            label="作答状态"
            value={status}
            options={[
              ["ALL", "全部状态", questions.length],
              ["ANSWERED", "已作答", answeredCount],
              ["UNANSWERED", "未作答", questions.length - answeredCount],
            ]}
            onChange={setStatus}
          />
          <AnswerSheetFilters
            label="题型"
            value={type}
            options={types}
            onChange={setType}
          />
          {(outcome !== "ALL" || status !== "ALL" || type !== "ALL") && (
            <button
              type="button"
              className="focus-visible:outline-brand min-h-8 text-xs font-medium text-sky-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => {
                setOutcome("ALL");
                setStatus("ALL");
                setType("ALL");
              }}
            >
              清除筛选
            </button>
          )}
        </>
      }
    />
  );
}
