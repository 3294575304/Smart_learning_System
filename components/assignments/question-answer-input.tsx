"use client";

import { QuestionType } from "@prisma/client";
import React from "react";

export interface AnswerOption {
  id: string;
  label: string;
  content: string;
  sortOrder: number;
}

export interface AnswerableQuestion {
  id: string;
  type: QuestionType;
  options: AnswerOption[];
}

export type QuestionAnswerState =
  | { kind: "CHOICE"; optionIds: string[] }
  | { kind: "BOOLEAN"; value: boolean | null }
  | { kind: "TEXT"; value: string };

interface Props {
  answer: QuestionAnswerState;
  disabled?: boolean;
  onChange: (answer: QuestionAnswerState) => void;
  question: AnswerableQuestion;
}

export function createEmptyQuestionAnswer(
  question: AnswerableQuestion,
): QuestionAnswerState {
  if (
    question.type === QuestionType.SINGLE_CHOICE ||
    question.type === QuestionType.MULTIPLE_CHOICE
  ) {
    return { kind: "CHOICE", optionIds: [] };
  }
  if (question.type === QuestionType.TRUE_FALSE) {
    return { kind: "BOOLEAN", value: null };
  }
  return { kind: "TEXT", value: "" };
}

export function QuestionAnswerInput({
  answer,
  disabled = false,
  onChange,
  question,
}: Props) {
  function setChoice(optionId: string, checked: boolean) {
    if (answer.kind !== "CHOICE") return;
    const optionIds =
      question.type === QuestionType.SINGLE_CHOICE
        ? [optionId]
        : checked
          ? [...new Set([...answer.optionIds, optionId])]
          : answer.optionIds.filter((id) => id !== optionId);
    onChange({ kind: "CHOICE", optionIds });
  }

  if (
    (question.type === QuestionType.SINGLE_CHOICE ||
      question.type === QuestionType.MULTIPLE_CHOICE) &&
    answer.kind === "CHOICE"
  ) {
    return (
      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">
          {question.type === QuestionType.SINGLE_CHOICE
            ? "请选择一个答案"
            : "请选择一个或多个答案"}
        </legend>
        {question.options.map((option) => (
          <label
            className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border p-3 has-disabled:cursor-not-allowed has-disabled:opacity-60"
            key={option.id}
          >
            <input
              checked={answer.optionIds.includes(option.id)}
              className="mt-0.5 shrink-0"
              disabled={disabled}
              name={
                question.type === QuestionType.SINGLE_CHOICE
                  ? question.id
                  : undefined
              }
              onChange={(event) => setChoice(option.id, event.target.checked)}
              type={
                question.type === QuestionType.SINGLE_CHOICE
                  ? "radio"
                  : "checkbox"
              }
            />
            <span className="min-w-0 text-sm break-words">
              <strong>{option.label}.</strong> {option.content}
            </span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (question.type === QuestionType.TRUE_FALSE && answer.kind === "BOOLEAN") {
    return (
      <fieldset className="mt-4 flex flex-wrap gap-4">
        <legend className="sr-only">请选择正确或错误</legend>
        {[
          { label: "正确", value: true },
          { label: "错误", value: false },
        ].map((item) => (
          <label
            className="flex cursor-pointer items-center gap-2 rounded-md border px-4 py-3 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-60"
            key={item.label}
          >
            <input
              checked={answer.value === item.value}
              disabled={disabled}
              name={question.id}
              onChange={() => onChange({ kind: "BOOLEAN", value: item.value })}
              type="radio"
            />
            {item.label}
          </label>
        ))}
      </fieldset>
    );
  }

  if (
    (question.type === QuestionType.FILL_BLANK ||
      question.type === QuestionType.SHORT_ANSWER) &&
    answer.kind === "TEXT"
  ) {
    const label =
      question.type === QuestionType.FILL_BLANK ? "填空答案" : "简答内容";
    return (
      <div className="mt-4">
        <label className="sr-only" htmlFor={`${question.id}-answer`}>
          {label}
        </label>
        <textarea
          className="min-h-28 w-full max-w-full rounded-md border p-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          id={`${question.id}-answer`}
          onChange={(event) =>
            onChange({ kind: "TEXT", value: event.target.value })
          }
          placeholder={
            question.type === QuestionType.FILL_BLANK
              ? "请输入答案"
              : "请输入作答内容"
          }
          value={answer.value}
        />
      </div>
    );
  }

  return (
    <p className="mt-4 text-sm text-red-600" role="alert">
      当前题目与作答类型不匹配，请刷新页面后重试。
    </p>
  );
}
