"use client";

import type { QuestionType } from "@prisma/client";
import { useState, type ReactNode } from "react";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import {
  AnswerSheetFilters,
  TeacherAnswerSheet,
  answerSheetTypeOptions,
  type AnswerSheetType,
} from "./teacher-answer-sheet";

export function TeacherPaperQuestionList({
  questions,
  totalPoints,
}: {
  questions: {
    id: string;
    order: number;
    type: QuestionType;
    content: ReactNode;
  }[];
  totalPoints: number;
}) {
  const [filter, setFilter] = useState<AnswerSheetType>("ALL");
  const shown =
    filter === "ALL"
      ? questions
      : questions.filter(({ type }) => type === filter);
  return (
    <>
      <TeacherAnswerSheet
        questions={shown.map(({ id, order, type }) => ({
          id,
          type,
          sortOrder: order,
        }))}
        total={questions.length}
        totalPoints={totalPoints}
        targetPrefix="paper-question-"
        filters={
          <AnswerSheetFilters
            label="题型"
            options={answerSheetTypeOptions(questions)}
            value={filter}
            onChange={setFilter}
          />
        }
      />
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
    </>
  );
}
