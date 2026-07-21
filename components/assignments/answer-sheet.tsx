"use client";

import { QuestionType, SubmissionStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";
import {
  QuestionAnswerInput,
  type QuestionAnswerState,
} from "@/components/assignments/question-answer-input";
import {
  bindQuestionTimingLifecycle,
  QuestionTimingTracker,
} from "@/components/assignments/question-timing";
import type { SavedAnswerInput } from "@/services/assignments/schemas";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";

interface DraftQuestion {
  id: string;
  title: string;
  content: string;
  type: QuestionType;
  sortOrder: number;
  points: number;
  options: Array<{
    id: string;
    label: string;
    content: string;
    sortOrder: number;
  }>;
}

interface SavedAnswer {
  assignmentQuestionId: string;
  textAnswer: string | null;
  booleanAnswer: boolean | null;
  optionIds: string[];
  responseTimeMs: number | null;
}

interface Props {
  submission: {
    id: string;
    assignmentTitle: string;
    attemptNumber: number;
    status: SubmissionStatus;
    version: number;
    dueAt: Date | null;
    questions: DraftQuestion[];
    answers: SavedAnswer[];
  };
}

type AnswerMap = Record<string, QuestionAnswerState>;
type SaveState = "idle" | "saving" | "saved" | "failed";

function initialAnswers(
  questions: DraftQuestion[],
  saved: SavedAnswer[],
): AnswerMap {
  const byQuestion = new Map(
    saved.map((answer) => [answer.assignmentQuestionId, answer]),
  );
  return Object.fromEntries(
    questions.map((question) => {
      const answer = byQuestion.get(question.id);
      if (
        question.type === QuestionType.SINGLE_CHOICE ||
        question.type === QuestionType.MULTIPLE_CHOICE
      ) {
        return [
          question.id,
          { kind: "CHOICE", optionIds: answer?.optionIds ?? [] },
        ];
      }
      if (question.type === QuestionType.TRUE_FALSE) {
        return [
          question.id,
          { kind: "BOOLEAN", value: answer?.booleanAnswer ?? null },
        ];
      }
      return [question.id, { kind: "TEXT", value: answer?.textAnswer ?? "" }];
    }),
  );
}

function apiAnswers(
  answers: AnswerMap,
  responseTimes: Record<string, number>,
): SavedAnswerInput[] {
  return Object.entries(answers).map(([assignmentQuestionId, answer]) => {
    const responseTimeMs = responseTimes[assignmentQuestionId] ?? 0;
    if (answer.kind === "CHOICE") {
      return answer.optionIds.length === 0
        ? { assignmentQuestionId, kind: "EMPTY", responseTimeMs }
        : {
            assignmentQuestionId,
            kind: "CHOICE",
            optionIds: answer.optionIds,
            responseTimeMs,
          };
    }
    if (answer.kind === "BOOLEAN") {
      return answer.value === null
        ? { assignmentQuestionId, kind: "EMPTY", responseTimeMs }
        : {
            assignmentQuestionId,
            kind: "BOOLEAN",
            value: answer.value,
            responseTimeMs,
          };
    }
    return answer.value.length === 0
      ? { assignmentQuestionId, kind: "EMPTY", responseTimeMs }
      : {
          assignmentQuestionId,
          kind: "TEXT",
          value: answer.value,
          responseTimeMs,
        };
  });
}

export function AnswerSheet({ submission }: Props) {
  const router = useRouter();
  const storageKey = `assignment-draft:${submission.id}`;
  const [answers, setAnswers] = useState<AnswerMap>(() =>
    initialAnswers(submission.questions, submission.answers),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const versionRef = useRef(submission.version);
  const latestAnswersRef = useRef(answers);
  const activeSaveRef = useRef<Promise<boolean> | null>(null);
  const hydratedRef = useRef(false);
  const trackerRef = useRef<QuestionTimingTracker | null>(null);
  if (!trackerRef.current) {
    trackerRef.current = new QuestionTimingTracker(
      submission.questions.map((question) => question.id),
      Object.fromEntries(
        submission.answers.map((answer) => [
          answer.assignmentQuestionId,
          answer.responseTimeMs ?? 0,
        ]),
      ),
    );
  }
  const timingTracker = trackerRef.current;

  const answeredCount = useMemo(
    () =>
      Object.values(answers).filter((answer) =>
        answer.kind === "CHOICE"
          ? answer.optionIds.length > 0
          : answer.kind === "BOOLEAN"
            ? answer.value !== null
            : answer.value.trim().length > 0,
      ).length,
    [answers],
  );

  const persistLocalDraft = useCallback(
    (snapshot: AnswerMap, responseTimes: Record<string, number>) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          answers: snapshot,
          responseTimes,
          savedAt: Date.now(),
        }),
      );
    },
    [storageKey],
  );

  const persist = useCallback(
    async (snapshot: AnswerMap): Promise<boolean> => {
      if (activeSaveRef.current) await activeSaveRef.current;
      const responseTimes = timingTracker.checkpoint();
      persistLocalDraft(snapshot, responseTimes);
      setSaveState("saving");
      setSaveError(null);
      const task = (async () => {
        const response = await requestAssignmentApi<{
          version: number;
          lastSavedAt: string;
        }>(`/api/student/submissions/${submission.id}/answers`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: versionRef.current,
            answers: apiAnswers(snapshot, responseTimes),
          }),
        });
        if (!response.success) {
          setSaveState("failed");
          setSaveError(response.error);
          return false;
        }
        versionRef.current = response.data.version;
        setSaveState("saved");
        if (latestAnswersRef.current === snapshot) {
          localStorage.removeItem(storageKey);
        }
        return true;
      })();
      activeSaveRef.current = task;
      try {
        return await task;
      } finally {
        activeSaveRef.current = null;
      }
    },
    [persistLocalDraft, storageKey, submission.id, timingTracker],
  );

  useEffect(() => {
    const local = localStorage.getItem(storageKey);
    if (local) {
      try {
        const parsed = JSON.parse(local) as {
          answers?: AnswerMap;
          responseTimes?: Record<string, number>;
        };
        if (parsed.answers) setAnswers(parsed.answers);
        if (parsed.responseTimes) {
          timingTracker.restoreAccumulated(parsed.responseTimes);
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    hydratedRef.current = true;
  }, [storageKey, timingTracker]);

  useEffect(() => {
    const firstQuestion = submission.questions[0];
    if (!firstQuestion) return;
    timingTracker.activate(firstQuestion.id);
    return bindQuestionTimingLifecycle(timingTracker, {
      documentTarget: document,
      windowTarget: window,
      isHidden: () => document.hidden,
      hasFocus: () => document.hasFocus(),
      beforeUnload: () =>
        persistLocalDraft(latestAnswersRef.current, timingTracker.snapshot()),
    });
  }, [persistLocalDraft, submission.questions, timingTracker]);

  useEffect(() => {
    latestAnswersRef.current = answers;
    if (!hydratedRef.current) return;
    persistLocalDraft(answers, timingTracker.checkpoint());
    setSaveState("idle");
    const timer = window.setTimeout(() => void persist(answers), 900);
    return () => window.clearTimeout(timer);
  }, [answers, persist, persistLocalDraft, timingTracker]);

  async function submit() {
    if (!window.confirm("确认提交作业？提交后本次答案将不能修改。")) return;
    setSubmitting(true);
    const saved = await persist(latestAnswersRef.current);
    if (!saved) {
      setSubmitting(false);
      return;
    }
    const response = await requestAssignmentApi<{ id: string }>(
      `/api/student/submissions/${submission.id}/submit`,
      { method: "POST" },
    );
    if (!response.success) {
      setSaveState("failed");
      setSaveError(response.error);
      setSubmitting(false);
      return;
    }
    localStorage.removeItem(storageKey);
    router.replace(`/student/submissions/${response.data.id}/result`);
    router.refresh();
  }

  function selectQuestion(nextIndex: number) {
    const nextQuestion = submission.questions[nextIndex];
    if (!nextQuestion || nextIndex === activeQuestionIndex) return;
    timingTracker.activate(nextQuestion.id);
    setActiveQuestionIndex(nextIndex);
    void persist(latestAnswersRef.current);
  }

  return (
    <section className="space-y-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 p-4 shadow-sm backdrop-blur">
        <div>
          <h1 className="font-semibold">{submission.assignmentTitle}</h1>
          <p className="text-sm text-gray-500">
            第 {submission.attemptNumber} 次作答 · 已答 {answeredCount}/
            {submission.questions.length} · 截止{" "}
            {submission.dueAt
              ? new Date(submission.dueAt).toLocaleString("zh-CN")
              : "未设置"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm ${saveState === "failed" ? "text-red-600" : "text-gray-500"}`}
          >
            {saveState === "saving"
              ? "保存中…"
              : saveState === "saved"
                ? "已自动保存"
                : saveState === "failed"
                  ? `自动保存失败：${saveError}`
                  : "等待自动保存"}
          </span>
          {saveState === "failed" ? (
            <button
              className="rounded border px-3 py-1 text-sm"
              onClick={() => void persist(latestAnswersRef.current)}
              type="button"
            >
              重试
            </button>
          ) : null}
          <button
            className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={submitting || saveState === "saving"}
            onClick={submit}
            type="button"
          >
            {submitting ? "提交中…" : "提交作业"}
          </button>
        </div>
      </div>

      <nav
        aria-label="题目导航"
        className="flex max-w-full flex-wrap gap-2 rounded-xl border bg-white p-4"
      >
        {submission.questions.map((question, index) => (
          <button
            aria-current={index === activeQuestionIndex ? "step" : undefined}
            className={`min-w-10 rounded-md border px-3 py-2 text-sm ${
              index === activeQuestionIndex
                ? "border-black bg-black text-white"
                : "bg-white hover:bg-gray-50"
            }`}
            key={question.id}
            onClick={() => selectQuestion(index)}
            type="button"
          >
            {question.sortOrder}
          </button>
        ))}
      </nav>

      {submission.questions[activeQuestionIndex]
        ? (() => {
            const question = submission.questions[activeQuestionIndex];
            const answer = answers[question.id];
            return (
              <article
                className="rounded-xl border bg-white p-5"
                key={question.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">
                      {question.sortOrder}. {question.title}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {QUESTION_TYPE_LABELS[question.type]}
                    </p>
                  </div>
                  <span className="text-sm text-gray-500">
                    {question.points} 分
                  </span>
                </div>
                <p className="mt-4 text-sm whitespace-pre-wrap">
                  {question.content}
                </p>
                {answer ? (
                  <QuestionAnswerInput
                    answer={answer}
                    onChange={(nextAnswer) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: nextAnswer,
                      }))
                    }
                    question={question}
                  />
                ) : null}
              </article>
            );
          })()
        : null}

      <div className="flex items-center justify-between gap-3">
        <button
          className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          disabled={activeQuestionIndex === 0}
          onClick={() => selectQuestion(activeQuestionIndex - 1)}
          type="button"
        >
          上一题
        </button>
        <span className="text-sm text-gray-500">
          {submission.questions.length === 0 ? 0 : activeQuestionIndex + 1} /{" "}
          {submission.questions.length}
        </span>
        <button
          className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          disabled={activeQuestionIndex >= submission.questions.length - 1}
          onClick={() => selectQuestion(activeQuestionIndex + 1)}
          type="button"
        >
          下一题
        </button>
      </div>
    </section>
  );
}
