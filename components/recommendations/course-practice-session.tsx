"use client";

import { RecommendationStatus } from "@prisma/client";
import Link from "next/link";
import { useState } from "react";

import {
  QuestionAnswerInput,
  createEmptyQuestionAnswer,
  type QuestionAnswerState,
} from "@/components/assignments/question-answer-input";
import { ProgrammingAttemptStatus } from "@/components/assignments/programming-attempt-status";
import {
  difficultyLabel,
  questionTypeLabel,
} from "@/components/recommendations/recommendation-presenters";
import type { getStudentPracticeSession } from "@/services/course-recommendations/service";

type Session = Awaited<ReturnType<typeof getStudentPracticeSession>>;
type Item = Session["items"][number];

interface Props {
  session: Session;
}

interface SubmitResponse {
  success: boolean;
  data?: {
    correctCount: number;
    totalCount: number;
    percentage: number;
    score: number;
    maxScore: number;
    answers: Array<{
      isCorrect: boolean;
      correctAnswer: string;
      explanation: string;
      score: number;
      maxScore: number;
    }>;
  };
  error?: string;
}

function answerPayload(questionId: string, answer: QuestionAnswerState) {
  if (answer.kind === "CODE") return null;
  if (answer.kind === "CHOICE")
    return { questionId, kind: answer.kind, optionIds: answer.optionIds };
  return { questionId, kind: answer.kind, value: answer.value };
}

export function CoursePracticeSession({ session }: Props) {
  const firstUnanswered = Math.max(
    0,
    session.items.findIndex(
      (item) => item.status !== RecommendationStatus.COMPLETED,
    ),
  );
  const [index, setIndex] = useState(firstUnanswered);
  const [answers, setAnswers] = useState<Record<string, QuestionAnswerState>>(
    {},
  );
  const [feedback, setFeedback] = useState<SubmitResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(
    session.items.every(
      (item) => item.status === RecommendationStatus.COMPLETED,
    ),
  );
  const [completedCount, setCompletedCount] = useState(
    session.items.filter(
      (item) => item.status === RecommendationStatus.COMPLETED,
    ).length,
  );
  const [earnedScore, setEarnedScore] = useState(
    session.items.reduce((sum, item) => sum + (item.score ?? 0), 0),
  );
  const [programmingAttemptId, setProgrammingAttemptId] = useState(
    session.items[firstUnanswered]?.programmingAttempt?.id ?? null,
  );
  const item: Item | undefined = session.items[index];
  function currentAnswer(question: Item): QuestionAnswerState {
    return answers[question.id] ?? createEmptyQuestionAnswer(question.question);
  }

  async function submitCurrent() {
    if (!item || busy) return;
    const answer = currentAnswer(item);
    if (answer.kind === "CODE") {
      if (!answer.value.trim()) {
        setError("请先编写 Python 代码。");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/recommendations/${encodeURIComponent(item.id)}/programming-attempts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceCode: answer.value,
              idempotencyKey: crypto.randomUUID(),
            }),
          },
        );
        const body = (await response.json()) as {
          success: boolean;
          data?: { attemptId: string };
          error?: string;
        };
        if (!response.ok || !body.success || !body.data)
          throw new Error(body.error ?? "Python 判题提交失败。");
        setProgrammingAttemptId(body.data.attemptId);
      } catch (submitError: unknown) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Python 判题提交失败。",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    const payloadAnswer = answerPayload(item.question.id, answer);
    if (!payloadAnswer) {
      setError("编程题请从原推荐页面提交判题；本练习页面暂不支持编程判题。");
      return;
    }
    if (
      (answer.kind === "CHOICE" && answer.optionIds.length === 0) ||
      (answer.kind === "BOOLEAN" && answer.value === null) ||
      (answer.kind === "TEXT" && !answer.value.trim())
    ) {
      setError("请先完成当前题目。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (item.status !== RecommendationStatus.STARTED) {
        const startResponse = await fetch(
          `/api/recommendations/${encodeURIComponent(item.id)}/start`,
          { method: "POST" },
        );
        const startBody = (await startResponse.json()) as SubmitResponse;
        if (!startResponse.ok || !startBody.success)
          throw new Error(startBody.error ?? "无法开始这道题，请刷新后重试。");
      }
      const response = await fetch(
        `/api/recommendations/${encodeURIComponent(item.id)}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            answers: [payloadAnswer],
          }),
        },
      );
      const body = (await response.json()) as SubmitResponse;
      if (!response.ok || !body.success || !body.data)
        throw new Error(body.error ?? "提交失败，请重试。");
      const result = body.data;
      setFeedback(result);
      setCompletedCount((count) => count + 1);
      setEarnedScore((score) => score + result.score);
      if (index === session.items.length - 1) setFinished(true);
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "提交失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }

  if (finished || !item) {
    const maximum = session.items.reduce(
      (total, question) => total + (question.maxScore ?? 1),
      0,
    );
    return (
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">
          {session.mode === "TEST" ? "测试完成" : "练习完成"}
        </h1>
        <section className="rounded-xl border bg-white p-6">
          <p>
            {session.course.name} · {session.classroomName}
          </p>
          <p className="mt-3 text-lg">
            已完成 {completedCount} / {session.items.length} 题
          </p>
          <p className="mt-2 text-lg">
            当前成绩：{earnedScore} / {maximum}
          </p>
          {feedback?.answers[0] ? (
            <div className="mt-5 rounded-lg bg-sky-50 p-4 text-sm">
              <p>
                {feedback.answers[0].isCorrect ? "答对了" : "答错了"} ·{" "}
                {feedback.answers[0].score}/{feedback.answers[0].maxScore}
              </p>
              <p className="mt-2">
                参考答案：{feedback.answers[0].correctAnswer}
              </p>
              <p className="mt-2 whitespace-pre-wrap">
                {feedback.answers[0].explanation}
              </p>
            </div>
          ) : null}
          <Link
            className="mt-5 inline-block text-sky-700 hover:underline"
            href="/student/recommendations"
          >
            返回练习中心
          </Link>
        </section>
      </main>
    );
  }

  const answer = currentAnswer(item);
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <Link
          className="text-sm text-gray-500 hover:underline"
          href="/student/recommendations"
        >
          ← 返回练习中心
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">
          {session.mode === "TEST" ? "课程测试" : "课程练习"}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {session.course.name} · {session.classroomName} · 图谱版本{" "}
          {session.graphVersionNumber}
        </p>
      </header>
      {session.mode === "PRACTICE" &&
      session.items.length < session.requestedCount ? (
        <p className="rounded-md bg-sky-50 p-3 text-sm text-sky-900">
          当前范围可用 {session.items.length}{" "}
          道题，已按实际题量开始练习（原选上限
          {session.requestedCount} 道）。
        </p>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-200"
        aria-label="完成进度"
      >
        <div
          className="h-full rounded-full bg-sky-600 transition-all"
          style={{
            width: `${Math.round((completedCount / session.items.length) * 100)}%`,
          }}
        />
      </div>
      <section className="rounded-xl border bg-white p-6">
        <div className="flex flex-wrap justify-between gap-3 text-sm text-gray-600">
          <span>
            第 {index + 1} / {session.items.length} 题
          </span>
          <span>
            {questionTypeLabel(item.question.type)} · 难度{" "}
            {difficultyLabel(item.question.difficulty)}
          </span>
        </div>
        <h2 className="mt-4 text-lg font-semibold">{item.question.title}</h2>
        <p className="mt-4 text-sm leading-7 whitespace-pre-wrap">
          {item.question.content}
        </p>
        <QuestionAnswerInput
          answer={answer}
          disabled={busy}
          onChange={(nextAnswer) =>
            setAnswers((current) => ({ ...current, [item.id]: nextAnswer }))
          }
          question={item.question}
        />
        {programmingAttemptId ? (
          <ProgrammingAttemptStatus
            assignmentQuestionId={item.question.id}
            attemptId={programmingAttemptId}
            onComplete={(score, maxScore) => {
              setEarnedScore((current) => current + score);
              setCompletedCount((current) => current + 1);
              setProgrammingAttemptId(null);
              setFeedback({
                correctCount: score >= maxScore ? 1 : 0,
                totalCount: 1,
                percentage: maxScore > 0 ? (score / maxScore) * 100 : 0,
                score,
                maxScore,
                answers: [
                  {
                    isCorrect: score >= maxScore,
                    correctAnswer: "Python 代码已根据隐藏测试用例判分。",
                    explanation: "判题完成，详细用例结果见上方。",
                    score,
                    maxScore,
                  },
                ],
              });
              if (index === session.items.length - 1) setFinished(true);
            }}
          />
        ) : null}
      </section>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {feedback?.answers[0] ? (
        <section className="rounded-xl border bg-sky-50 p-5 text-sm">
          <p className="font-semibold">
            {feedback.answers[0].isCorrect ? "回答正确" : "回答错误"} ·{" "}
            {feedback.answers[0].score}/{feedback.answers[0].maxScore}
          </p>
          <p className="mt-2">参考答案：{feedback.answers[0].correctAnswer}</p>
          <p className="mt-2 whitespace-pre-wrap">
            {feedback.answers[0].explanation}
          </p>
        </section>
      ) : null}
      <button
        className="rounded-md bg-sky-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        disabled={busy || Boolean(programmingAttemptId)}
        onClick={() => {
          if (feedback) {
            if (index === session.items.length - 1) setFinished(true);
            else {
              setIndex(index + 1);
              setFeedback(null);
              setProgrammingAttemptId(null);
            }
          } else void submitCurrent();
        }}
        type="button"
      >
        {busy
          ? "正在提交并批改…"
          : programmingAttemptId
            ? "判题中…"
            : feedback
              ? index === session.items.length - 1
                ? "查看练习结果"
                : "下一题"
              : index === session.items.length - 1
                ? "提交并完成"
                : "提交并进入下一题"}
      </button>
    </main>
  );
}
