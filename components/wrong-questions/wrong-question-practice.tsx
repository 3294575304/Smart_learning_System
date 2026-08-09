"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { GradingStatus, QuestionType } from "@prisma/client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import {
  createEmptyQuestionAnswer,
  QuestionAnswerInput,
  type QuestionAnswerState,
} from "@/components/assignments/question-answer-input";
import { MasteryToggleButton } from "@/components/wrong-questions/mastery-toggle-button";
import { practiceWrongQuestionRequest } from "@/lib/api/wrong-questions";
import {
  wrongQuestionPracticeSchema,
  type WrongQuestionPracticeInput,
} from "@/services/wrong-questions/schemas";
import type {
  WrongQuestionDetail,
  WrongQuestionPracticeResult,
} from "@/services/wrong-questions/types";

function practiceInput(
  answer: QuestionAnswerState,
): WrongQuestionPracticeInput {
  if (answer.kind === "BOOLEAN") {
    if (answer.value === null) {
      return { answer: { kind: "TEXT", value: "" } };
    }
    return { answer: { kind: answer.kind, value: answer.value } };
  }
  if (answer.kind === "CODE") {
    return { answer: { kind: "TEXT", value: answer.value } };
  }
  return { answer };
}

export function WrongQuestionPractice({
  question,
}: {
  question: WrongQuestionDetail;
}) {
  const answerableQuestion = {
    id: question.questionId,
    type: question.type,
    options: question.options,
  };
  const [answer, setAnswer] = useState<QuestionAnswerState>(() =>
    createEmptyQuestionAnswer(answerableQuestion),
  );
  const [result, setResult] = useState<WrongQuestionPracticeResult | null>(
    null,
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<
    z.input<typeof wrongQuestionPracticeSchema>,
    unknown,
    z.output<typeof wrongQuestionPracticeSchema>
  >({
    resolver: zodResolver(wrongQuestionPracticeSchema),
    defaultValues: practiceInput(createEmptyQuestionAnswer(answerableQuestion)),
  });

  if (question.type === QuestionType.PYTHON_PROGRAMMING) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Python
        错题需要回到原作业，通过公开样例运行或正式提交重新判题；这里不会把代码当作普通文本答案评分。
      </div>
    );
  }

  async function submit(input: WrongQuestionPracticeInput) {
    setServerError(null);
    setResult(null);
    const response = await practiceWrongQuestionRequest(question.id, input);
    if (!response.success) {
      setServerError(response.error);
      return;
    }
    setResult(response.data);
  }

  return (
    <section className="rounded-xl border bg-white p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">重新练习</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          答案由服务端判定；本次练习不会创建新的作业或推荐记录。
        </p>
      </div>

      <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(submit)}>
        <QuestionAnswerInput
          answer={answer}
          disabled={form.formState.isSubmitting}
          onChange={(nextAnswer) => {
            setAnswer(nextAnswer);
            form.setValue("answer", practiceInput(nextAnswer).answer, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          question={answerableQuestion}
        />
        {form.formState.errors.answer ? (
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
          className="rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting ? "正在判分..." : "提交练习"}
        </button>
      </form>

      {result ? (
        <div
          className={
            result.isCorrect === true
              ? "mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
              : result.gradingStatus === GradingStatus.MANUAL_REVIEW_REQUIRED
                ? "mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4"
                : "mt-5 rounded-lg border border-red-200 bg-red-50 p-4"
          }
          role="status"
        >
          <p className="font-medium">
            {result.isCorrect === true
              ? "回答正确"
              : result.gradingStatus === GradingStatus.MANUAL_REVIEW_REQUIRED
                ? "简答题无法自动判分"
                : "回答错误"}
          </p>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">本次答案</dt>
              <dd className="mt-1 whitespace-pre-wrap">
                {result.studentAnswer}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">正确 / 参考答案</dt>
              <dd className="mt-1 whitespace-pre-wrap">
                {result.correctAnswer}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm whitespace-pre-wrap">
            解析：{result.explanation}
          </p>
          {result.canMarkMastered && !question.isMastered ? (
            <div className="mt-4">
              <MasteryToggleButton
                initialIsMastered={question.isMastered}
                wrongQuestionId={question.id}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
