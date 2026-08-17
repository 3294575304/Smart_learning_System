"use client";

import { CourseSurveyMode, CourseSurveyQuestionType } from "@prisma/client";
import { useState } from "react";

import { requestCourseSurveyApi } from "@/components/course-surveys/request";
import { COURSE_SURVEY_LIKERT_LABELS } from "@/services/course-surveys/constants";

interface Question {
  id: string;
  type: CourseSurveyQuestionType;
  prompt: string;
  required: boolean;
  sortOrder: number;
  outcomeCode: string | null;
  outcomeTitle: string | null;
}

export function StudentSurveyForm({
  surveyId,
  mode,
  questions,
}: {
  surveyId: string;
  mode: CourseSurveyMode;
  questions: Question[];
}) {
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);

  async function submit() {
    const missing = questions.some(
      (question) =>
        question.required &&
        (answers[question.id] === undefined || answers[question.id] === ""),
    );
    if (missing) {
      setError("请完成所有必答题。");
      return;
    }
    if (!window.confirm("问卷提交后不能修改，确认提交吗？")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestCourseSurveyApi<{
        submittedAt: string;
        reused: boolean;
      }>(`/api/student/surveys/${surveyId}/responses`, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          answers: questions.flatMap((question) => {
            const value = answers[question.id];
            if (value === undefined || value === "") return [];
            return [
              {
                questionId: question.id,
                kind: question.type === "LIKERT_5" ? "SCALE" : "TEXT",
                value,
              },
            ];
          }),
        }),
      });
      setSubmittedAt(new Date(result.submittedAt));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  if (submittedAt)
    return (
      <div className="rounded-xl border bg-emerald-50 p-8 text-center">
        <h2 className="font-semibold text-emerald-800">问卷已提交</h2>
        <p className="mt-2 text-sm text-emerald-700">
          提交时间：{submittedAt.toLocaleString("zh-CN")}。感谢你的反馈。
        </p>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800">
        <strong>本问卷不计入课程成绩。</strong>
        {mode === "ANONYMOUS"
          ? " 匿名回答不保存学生标识，教师只能查看达到小样本阈值后的班级汇总。"
          : " 本问卷采用实名收集，但教学质量报告只使用班级聚合结果。"}
      </div>
      {questions.map((question) => (
        <section
          className="space-y-3 rounded-xl border bg-white p-5"
          key={question.id}
        >
          <div>
            <p className="font-medium">
              {question.sortOrder}. {question.prompt}
              {question.required ? (
                <span className="ml-1 text-red-600">*</span>
              ) : null}
            </p>
            {question.outcomeCode ? (
              <p className="mt-1 text-xs text-gray-500">
                {question.outcomeCode} · {question.outcomeTitle}
              </p>
            ) : null}
          </div>
          {question.type === "LIKERT_5" ? (
            <div className="grid gap-2 sm:grid-cols-5">
              {COURSE_SURVEY_LIKERT_LABELS.map((label, index) => (
                <label
                  className={`cursor-pointer rounded-md border p-3 text-center text-sm ${answers[question.id] === index + 1 ? "border-gray-900 bg-gray-900 text-white" : "hover:bg-gray-50"}`}
                  key={label}
                >
                  <input
                    className="sr-only"
                    name={question.id}
                    type="radio"
                    value={index + 1}
                    onChange={() =>
                      setAnswers({ ...answers, [question.id]: index + 1 })
                    }
                  />
                  {index + 1}
                  <span className="mt-1 block text-xs">{label}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea
              className="min-h-28 w-full rounded-md border px-3 py-2"
              maxLength={5000}
              placeholder="请勿填写姓名、学号、手机号等个人信息"
              value={(answers[question.id] as string | undefined) ?? ""}
              onChange={(event) =>
                setAnswers({ ...answers, [question.id]: event.target.value })
              }
            />
          )}
        </section>
      ))}
      {error ? (
        <p
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        disabled={busy}
        onClick={() => void submit()}
        type="button"
      >
        {busy ? "提交中…" : "提交问卷"}
      </button>
    </div>
  );
}
