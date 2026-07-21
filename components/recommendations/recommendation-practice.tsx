"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  createEmptyQuestionAnswer,
  QuestionAnswerInput,
  type QuestionAnswerState,
} from "@/components/assignments/question-answer-input";
import {
  difficultyLabel,
  questionTypeLabel,
} from "@/components/recommendations/recommendation-presenters";
import type { RecommendationDetailView } from "@/services/recommendations/types";

interface Props {
  recommendation: RecommendationDetailView;
}

function isStoredAnswer(value: unknown): value is QuestionAnswerState {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  if (value.kind === "CHOICE") {
    return (
      "optionIds" in value &&
      Array.isArray(value.optionIds) &&
      value.optionIds.every((id) => typeof id === "string")
    );
  }
  if (value.kind === "BOOLEAN") {
    return (
      "value" in value &&
      (typeof value.value === "boolean" || value.value === null)
    );
  }
  return (
    value.kind === "TEXT" && "value" in value && typeof value.value === "string"
  );
}

export function RecommendationPractice({ recommendation }: Props) {
  const question = {
    id: recommendation.questionId,
    type: recommendation.type,
    options: recommendation.options,
  };
  const storageKey = `recommendation-draft:${recommendation.id}`;
  const [answer, setAnswer] = useState<QuestionAnswerState>(() =>
    createEmptyQuestionAnswer(question),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed: unknown = JSON.parse(stored);
        if (isStoredAnswer(parsed)) setAnswer(parsed);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(storageKey, JSON.stringify(answer));
  }, [answer, hydrated, storageKey]);

  return (
    <section className="min-w-0 space-y-6">
      <header className="min-w-0">
        <Link
          className="text-sm text-gray-500 hover:underline"
          href={`/student/recommendations/${recommendation.id}`}
        >
          ← 返回推荐详情
        </Link>
        <h1 className="mt-2 text-2xl font-semibold break-words">推荐练习</h1>
        <p className="mt-2 text-sm leading-6 text-amber-800" role="status">
          当前版本支持练习和本机暂存；推荐答案提交与判分功能尚未接入。
        </p>
      </header>

      <article className="min-w-0 rounded-xl border bg-white p-4 sm:p-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold break-words">
              {recommendation.title}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {questionTypeLabel(recommendation.type)} · 难度
              {difficultyLabel(recommendation.difficulty)}
            </p>
          </div>
          <span className="w-fit shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
            进行中
          </span>
        </div>
        <p className="mt-5 text-sm leading-7 break-words whitespace-pre-wrap">
          {recommendation.content}
        </p>
        <QuestionAnswerInput
          answer={answer}
          onChange={setAnswer}
          question={question}
        />
      </article>

      <p aria-live="polite" className="text-sm text-gray-500">
        {hydrated ? "作答内容已暂存在当前浏览器。" : "正在恢复本地作答…"}
      </p>
    </section>
  );
}
