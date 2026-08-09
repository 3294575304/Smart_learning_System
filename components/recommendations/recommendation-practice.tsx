"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { QuestionType, RecommendationStatus } from "@prisma/client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  QuestionAnswerInput,
  type QuestionAnswerState,
} from "@/components/assignments/question-answer-input";
import {
  difficultyLabel,
  questionTypeLabel,
} from "@/components/recommendations/recommendation-presenters";
import { submitRecommendationPracticeRequest } from "@/lib/api/recommendations";
import {
  type RecommendationPracticeAnswerInput,
  type RecommendationPracticeSubmitData,
} from "@/services/recommendations/schemas";
import type {
  RecommendationDetailView,
  RecommendationPracticeResultView,
} from "@/services/recommendations/types";

interface Props {
  recommendation: RecommendationDetailView;
}

const clientPracticeFormSchema = z.object({
  answer: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("CHOICE"),
      optionIds: z.array(z.string()).min(1, "请至少选择一个选项"),
    }),
    z.object({ kind: z.literal("BOOLEAN"), value: z.boolean() }),
    z.object({
      kind: z.literal("TEXT"),
      value: z.string().refine((text) => text.trim().length > 0, "请输入答案"),
    }),
  ]),
});

type ClientPracticeFormData = z.output<typeof clientPracticeFormSchema>;

function withQuestionId(
  questionId: string,
  answer: QuestionAnswerState,
): RecommendationPracticeAnswerInput {
  if (answer.kind === "CHOICE") {
    return { questionId, kind: answer.kind, optionIds: answer.optionIds };
  }
  if (answer.kind === "BOOLEAN") {
    if (answer.value === null) {
      throw new Error("布尔题尚未作答");
    }
    return { questionId, kind: answer.kind, value: answer.value };
  }
  if (answer.kind === "CODE") {
    throw new Error("推荐练习暂不直接执行编程题，请进入原作业完成判题");
  }
  return { questionId, kind: answer.kind, value: answer.value };
}

function PracticeResult({
  result,
}: {
  result: RecommendationPracticeResultView;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-medium text-emerald-900">推荐练习已完成</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-emerald-700">正确题数</dt>
            <dd className="mt-1 text-lg font-semibold">
              {result.correctCount} / {result.totalCount}
            </dd>
          </div>
          <div>
            <dt className="text-emerald-700">正确率</dt>
            <dd className="mt-1 text-lg font-semibold">{result.percentage}%</dd>
          </div>
          <div>
            <dt className="text-emerald-700">得分</dt>
            <dd className="mt-1 text-lg font-semibold">
              {result.score} / {result.maxScore}
            </dd>
          </div>
          <div>
            <dt className="text-emerald-700">完成时间</dt>
            <dd className="mt-1">
              {new Date(result.completedAt).toLocaleString("zh-CN")}
            </dd>
          </div>
        </dl>
      </div>

      {result.answers.map((answer) => (
        <article
          className="rounded-xl border bg-white p-5"
          key={answer.questionId}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-semibold">{answer.title}</h2>
            <span
              className={
                answer.isCorrect
                  ? "rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800"
                  : "rounded-full bg-red-100 px-3 py-1 text-xs text-red-800"
              }
            >
              {answer.isCorrect ? "回答正确" : "回答错误"} · {answer.score}/
              {answer.maxScore}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-md bg-gray-50 p-3">
              <dt className="text-gray-500">你的答案</dt>
              <dd className="mt-1 whitespace-pre-wrap">
                {answer.studentAnswer}
              </dd>
            </div>
            <div className="rounded-md bg-gray-50 p-3">
              <dt className="text-gray-500">正确答案</dt>
              <dd className="mt-1 whitespace-pre-wrap">
                {answer.correctAnswer}
              </dd>
            </div>
          </dl>
          <div className="mt-4 rounded-md border-l-4 border-blue-300 bg-blue-50 p-3 text-sm">
            <p className="font-medium">答案解析</p>
            <p className="mt-1 whitespace-pre-wrap">{answer.explanation}</p>
          </div>
          <div className="mt-3 rounded-md border-l-4 border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-medium">推荐理由</p>
            <p className="mt-1 whitespace-pre-wrap">
              {answer.recommendationReason}
            </p>
          </div>
        </article>
      ))}
    </section>
  );
}

export function RecommendationPractice({ recommendation }: Props) {
  const question = {
    id: recommendation.questionId,
    type: recommendation.type,
    options: recommendation.options,
  };
  const [result, setResult] = useState<RecommendationPracticeResultView | null>(
    recommendation.practiceResult,
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const form = useForm<
    z.input<typeof clientPracticeFormSchema>,
    unknown,
    ClientPracticeFormData
  >({
    resolver: zodResolver(clientPracticeFormSchema),
    mode: "onChange",
  });
  const watchedAnswer =
    form.watch("answer") ??
    (recommendation.type === QuestionType.SINGLE_CHOICE ||
    recommendation.type === QuestionType.MULTIPLE_CHOICE
      ? { kind: "CHOICE" as const, optionIds: [] }
      : recommendation.type === QuestionType.TRUE_FALSE
        ? { kind: "BOOLEAN" as const, value: null }
        : { kind: "TEXT" as const, value: "" });

  async function submit(input: ClientPracticeFormData) {
    if (
      !window.confirm(
        "确认提交推荐练习？提交后将立即判分并更新知识掌握度，答案不可修改。",
      )
    ) {
      return;
    }
    setServerError(null);
    const payload: RecommendationPracticeSubmitData = {
      idempotencyKey,
      answers: [withQuestionId(recommendation.questionId, input.answer)],
    };
    const response = await submitRecommendationPracticeRequest(
      recommendation.id,
      payload,
    );
    if (!response.success) {
      setServerError(
        response.status === 409
          ? "练习状态已变化或已完成，请刷新页面查看最新结果。"
          : response.error,
      );
      return;
    }
    setResult(response.data);
  }

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
        <p className="mt-2 text-sm text-gray-600">
          作答结果由服务端判分，并同步更新错题与知识掌握度。
        </p>
      </header>

      {result ? (
        <PracticeResult result={result} />
      ) : recommendation.status === RecommendationStatus.COMPLETED ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"
          role="status"
        >
          该推荐已完成，但历史记录没有可展示的答案明细；为避免重复更新掌握度，不能再次提交。
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit((input) => void submit(input))}
        >
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
              answer={watchedAnswer}
              disabled={form.formState.isSubmitting}
              onChange={(answer) => {
                if (answer.kind === "BOOLEAN") {
                  if (answer.value === null) return;
                  form.setValue(
                    "answer",
                    { kind: answer.kind, value: answer.value },
                    { shouldDirty: true, shouldValidate: true },
                  );
                  return;
                }
                if (answer.kind === "CODE") return;
                form.setValue("answer", answer, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              question={question}
            />
          </article>

          {form.formState.isSubmitted && !form.formState.isValid ? (
            <p className="text-sm text-red-700" role="alert">
              请完成当前题目后再提交。
            </p>
          ) : null}
          {serverError ? (
            <p className="text-sm text-red-700" role="alert">
              {serverError}
            </p>
          ) : null}
          <button
            className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={form.formState.isSubmitting}
            type="submit"
          >
            {form.formState.isSubmitting ? "正在提交并判分…" : "提交练习"}
          </button>
        </form>
      )}
    </section>
  );
}
