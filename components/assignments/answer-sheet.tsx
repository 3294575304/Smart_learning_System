"use client";

import { QuestionType, SubmissionStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";
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

type AnswerState =
  | { kind: "CHOICE"; optionIds: string[] }
  | { kind: "BOOLEAN"; value: boolean | null }
  | { kind: "TEXT"; value: string };

type AnswerMap = Record<string, AnswerState>;
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

function apiAnswers(answers: AnswerMap): SavedAnswerInput[] {
  return Object.entries(answers).map(([assignmentQuestionId, answer]) => {
    if (answer.kind === "CHOICE") {
      return answer.optionIds.length === 0
        ? { assignmentQuestionId, kind: "EMPTY" }
        : { assignmentQuestionId, kind: "CHOICE", optionIds: answer.optionIds };
    }
    if (answer.kind === "BOOLEAN") {
      return answer.value === null
        ? { assignmentQuestionId, kind: "EMPTY" }
        : { assignmentQuestionId, kind: "BOOLEAN", value: answer.value };
    }
    return answer.value.length === 0
      ? { assignmentQuestionId, kind: "EMPTY" }
      : { assignmentQuestionId, kind: "TEXT", value: answer.value };
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
  const versionRef = useRef(submission.version);
  const latestAnswersRef = useRef(answers);
  const activeSaveRef = useRef<Promise<boolean> | null>(null);
  const hydratedRef = useRef(false);

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

  const persist = useCallback(
    async (snapshot: AnswerMap): Promise<boolean> => {
      if (activeSaveRef.current) await activeSaveRef.current;
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
            answers: apiAnswers(snapshot),
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
    [storageKey, submission.id],
  );

  useEffect(() => {
    const local = localStorage.getItem(storageKey);
    if (local) {
      try {
        const parsed = JSON.parse(local) as { answers: AnswerMap };
        if (parsed.answers) setAnswers(parsed.answers);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    hydratedRef.current = true;
  }, [storageKey]);

  useEffect(() => {
    latestAnswersRef.current = answers;
    if (!hydratedRef.current) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({ answers, savedAt: Date.now() }),
    );
    setSaveState("idle");
    const timer = window.setTimeout(() => void persist(answers), 900);
    return () => window.clearTimeout(timer);
  }, [answers, persist, storageKey]);

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

  function setChoice(
    question: DraftQuestion,
    optionId: string,
    checked: boolean,
  ) {
    setAnswers((current) => {
      const existing = current[question.id];
      const selected = existing?.kind === "CHOICE" ? existing.optionIds : [];
      const optionIds =
        question.type === QuestionType.SINGLE_CHOICE
          ? [optionId]
          : checked
            ? [...new Set([...selected, optionId])]
            : selected.filter((id) => id !== optionId);
      return { ...current, [question.id]: { kind: "CHOICE", optionIds } };
    });
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

      {submission.questions.map((question) => {
        const answer = answers[question.id];
        return (
          <article className="rounded-xl border bg-white p-5" key={question.id}>
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
            {(question.type === QuestionType.SINGLE_CHOICE ||
              question.type === QuestionType.MULTIPLE_CHOICE) &&
            answer?.kind === "CHOICE" ? (
              <div className="mt-4 space-y-2">
                {question.options.map((option) => (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
                    key={option.id}
                  >
                    <input
                      checked={answer.optionIds.includes(option.id)}
                      name={
                        question.type === QuestionType.SINGLE_CHOICE
                          ? question.id
                          : undefined
                      }
                      onChange={(event) =>
                        setChoice(question, option.id, event.target.checked)
                      }
                      type={
                        question.type === QuestionType.SINGLE_CHOICE
                          ? "radio"
                          : "checkbox"
                      }
                    />
                    <span className="text-sm">
                      <strong>{option.label}.</strong> {option.content}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            {question.type === QuestionType.TRUE_FALSE &&
            answer?.kind === "BOOLEAN" ? (
              <div className="mt-4 flex gap-4">
                {[
                  { label: "正确", value: true },
                  { label: "错误", value: false },
                ].map((item) => (
                  <label
                    className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm"
                    key={item.label}
                  >
                    <input
                      checked={answer.value === item.value}
                      name={question.id}
                      onChange={() =>
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: { kind: "BOOLEAN", value: item.value },
                        }))
                      }
                      type="radio"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            ) : null}
            {(question.type === QuestionType.FILL_BLANK ||
              question.type === QuestionType.SHORT_ANSWER) &&
            answer?.kind === "TEXT" ? (
              <textarea
                className="mt-4 min-h-28 w-full rounded-md border p-3 text-sm"
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: { kind: "TEXT", value: event.target.value },
                  }))
                }
                placeholder={
                  question.type === QuestionType.FILL_BLANK
                    ? "请输入答案"
                    : "请输入作答内容"
                }
                value={answer.value}
              />
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
