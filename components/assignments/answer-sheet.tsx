"use client";

import {
  studentTaskHref,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";

import { FavoriteButton } from "@/components/question-favorites/favorite-button";
import { QuestionType, SubmissionStatus } from "@prisma/client";
import Image from "next/image";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SubmissionAttachments } from "@/components/assignments/submission-attachments";
import { QuestionText } from "@/components/assignments/question-text";
import { requestAssignmentApi } from "@/components/assignments/request-api";
import {
  parseAssignmentLocalDraft,
  type AssignmentLocalDraft,
} from "./local-draft";
import { ProgrammingQuestionInput } from "@/components/assignments/programming-question-input";
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
  images?: Array<{ id: string; url: string }>;
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
  autosaveDelayMs: number;
  scope?: StudentTaskScope;
  submission: {
    id: string;
    assignmentTitle: string;
    allowAttachments?: boolean;
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
type FinalAction = "exit" | "submit";

/** 提交前判断一题是否仍为空，用于在确认框里提示漏答数量。 */
function isBlankAnswer(answer: QuestionAnswerState | undefined): boolean {
  if (!answer) return true;
  switch (answer.kind) {
    case "CHOICE":
      return answer.optionIds.length === 0;
    case "BOOLEAN":
      return answer.value === null;
    case "TEXT":
    case "CODE":
      return answer.value.trim().length === 0;
    default:
      return true;
  }
}

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
      if (question.type === QuestionType.PYTHON_PROGRAMMING) {
        return [question.id, { kind: "CODE", value: answer?.textAnswer ?? "" }];
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
          kind: answer.kind === "CODE" ? "CODE" : "TEXT",
          value: answer.value,
          responseTimeMs,
        };
  });
}

export function AnswerSheet({
  autosaveDelayMs,
  submission,
  scope = {},
}: Props) {
  const router = useRouter();
  const storageKey = `assignment-draft:${submission.id}`;
  const [answers, setAnswers] = useState<AnswerMap>(() =>
    initialAnswers(submission.questions, submission.answers),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [finalAction, setFinalAction] = useState<FinalAction | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [pendingDraft, setPendingDraft] = useState<AssignmentLocalDraft | null>(
    null,
  );
  const [online, setOnline] = useState(true);
  const [localDraftStored, setLocalDraftStored] = useState(false);
  const [saveConflict, setSaveConflict] = useState(false);
  const [ready, setReady] = useState(false);
  const draftDecisionRef = useRef(false);
  const versionRef = useRef(submission.version);
  const latestAnswersRef = useRef(answers);
  const activeSaveRef = useRef<Promise<boolean> | null>(null);
  const finalActionRef = useRef<FinalAction | null>(null);
  const leavingRef = useRef(false);
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
      if (draftDecisionRef.current) return;
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            answers: snapshot,
            responseTimes,
            savedAt: Date.now(),
          }),
        );
        setLocalDraftStored(true);
      } catch {
        setLocalDraftStored(false);
      }
    },
    [storageKey],
  );

  const clearLocalDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setLocalDraftStored(false);
    } catch {
      // Storage can be unavailable even when the server save succeeded.
    }
  }, [storageKey]);

  const persist = useCallback(
    async (finalizing = false): Promise<boolean> => {
      while (activeSaveRef.current) await activeSaveRef.current;
      if (draftDecisionRef.current || (finalActionRef.current && !finalizing))
        return false;
      const snapshot = latestAnswersRef.current;
      const responseTimes = timingTracker.checkpoint();
      persistLocalDraft(snapshot, responseTimes);
      if (!navigator.onLine) {
        setSaveState("failed");
        setSaveError("网络已断开，尚未保存到账号。连接恢复后可以重试。");
        return false;
      }
      setSaveState("saving");
      setSaveError(null);
      const task = (async () => {
        const response = await requestAssignmentApi<{
          version: number;
          lastSavedAt: string;
        }>(`/api/student/submissions/${submission.id}/answers`, {
          method: "PUT",
          signal: AbortSignal.timeout(15_000),
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: versionRef.current,
            answers: apiAnswers(snapshot, responseTimes),
          }),
        });
        if (!response.success) {
          setSaveState("failed");
          setSaveError(response.error);
          setSaveConflict(response.status === 409);
          return false;
        }
        versionRef.current = response.data.version;
        setSaveConflict(false);
        setSaveState(latestAnswersRef.current === snapshot ? "saved" : "idle");
        if (latestAnswersRef.current === snapshot) {
          clearLocalDraft();
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
    [clearLocalDraft, persistLocalDraft, submission.id, timingTracker],
  );

  useEffect(() => {
    try {
      const local = localStorage.getItem(storageKey);
      if (local) {
        const draft = parseAssignmentLocalDraft(
          local,
          submission.questions,
          latestAnswersRef.current,
        );
        if (
          draft &&
          JSON.stringify(draft.answers) !==
            JSON.stringify(latestAnswersRef.current)
        ) {
          draftDecisionRef.current = true;
          setPendingDraft(draft);
          setLocalDraftStored(true);
        } else {
          if (draft) timingTracker.restoreAccumulated(draft.responseTimes);
          clearLocalDraft();
        }
      }
    } catch {
      clearLocalDraft();
    }
    hydratedRef.current = true;
    setReady(true);
  }, [clearLocalDraft, storageKey, submission.questions, timingTracker]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const disconnected = () => setOnline(false);
    const connected = () => {
      setOnline(true);
      if (!draftDecisionRef.current && !finalActionRef.current) void persist();
    };
    window.addEventListener("offline", disconnected);
    window.addEventListener("online", connected);
    return () => {
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("online", connected);
    };
  }, [persist]);

  useEffect(() => {
    const firstQuestion = submission.questions[0];
    if (!firstQuestion) return;
    timingTracker.activate(firstQuestion.id);
    return bindQuestionTimingLifecycle(timingTracker, {
      documentTarget: document,
      windowTarget: window,
      isHidden: () => document.hidden,
      hasFocus: () => document.hasFocus(),
      beforeUnload: () => {
        if (!leavingRef.current)
          persistLocalDraft(latestAnswersRef.current, timingTracker.snapshot());
      },
    });
  }, [persistLocalDraft, submission.questions, timingTracker]);

  useEffect(() => {
    if (
      !hydratedRef.current ||
      finalActionRef.current ||
      draftDecisionRef.current
    )
      return;
    persistLocalDraft(latestAnswersRef.current, timingTracker.checkpoint());
    setSaveState("idle");
    const timer = window.setTimeout(() => void persist(), autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [answers, autosaveDelayMs, persist, persistLocalDraft, timingTracker]);

  async function finish(action: FinalAction) {
    if (
      !hydratedRef.current ||
      attachmentPending ||
      finalActionRef.current ||
      draftDecisionRef.current
    )
      return;
    if (action === "submit") {
      const blank = submission.questions.filter((question) =>
        isBlankAnswer(answers[question.id]),
      ).length;
      const confirmation = blank
        ? `还有 ${blank} 题未作答。确认提交作业？提交后本次答案将不能修改。`
        : "确认提交作业？提交后本次答案将不能修改。";
      if (!window.confirm(confirmation)) return;
    }
    finalActionRef.current = action;
    setFinalAction(action);
    try {
      if (!(await persist(true))) return;
      if (action === "exit") {
        leavingRef.current = true;
        window.location.replace(
          studentTaskHref("/student/assignments?status=TODO", scope),
        );
        return;
      }
      const response = await requestAssignmentApi<{ id: string }>(
        `/api/student/submissions/${submission.id}/submit`,
        { method: "POST" },
      );
      if (!response.success) {
        setSaveState("failed");
        setSaveError(`提交失败：${response.error}`);
        return;
      }
      leavingRef.current = true;
      router.replace(
        studentTaskHref(
          `/student/submissions/${response.data.id}/result`,
          scope,
        ),
      );
      router.refresh();
    } finally {
      if (!leavingRef.current) {
        finalActionRef.current = null;
        setFinalAction(null);
      }
    }
  }

  function changeAnswer(questionId: string, answer: QuestionAnswerState) {
    if (finalActionRef.current || draftDecisionRef.current) return;
    const updated = { ...latestAnswersRef.current, [questionId]: answer };
    latestAnswersRef.current = updated;
    setAnswers(updated);
  }

  function selectQuestion(nextIndex: number) {
    if (attachmentPending || finalActionRef.current) return;
    const nextQuestion = submission.questions[nextIndex];
    if (!nextQuestion || nextIndex === activeQuestionIndex) return;
    timingTracker.activate(nextQuestion.id);
    setActiveQuestionIndex(nextIndex);
    void persist();
  }

  const hasQuestionNavigation = submission.questions.length > 1;
  const editingDisabled =
    !ready || Boolean(pendingDraft) || Boolean(finalAction);

  function resolveDraft(useLocal: boolean) {
    if (useLocal && pendingDraft) {
      latestAnswersRef.current = pendingDraft.answers;
      timingTracker.restoreAccumulated(pendingDraft.responseTimes);
      setAnswers(pendingDraft.answers);
    } else {
      clearLocalDraft();
    }
    draftDecisionRef.current = false;
    setPendingDraft(null);
    setSaveState("idle");
    if (useLocal) void persist();
  }

  return (
    <section className="space-y-6">
      {pendingDraft && (
        <section
          aria-labelledby="assignment-recovery-title"
          className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <h2
            id="assignment-recovery-title"
            className="font-semibold text-slate-950"
          >
            发现本机未同步的作答
          </h2>
          <p className="text-sm text-slate-700">
            当前显示账号中的答案。请选择恢复本机作答，或继续使用账号中的答案。
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => resolveDraft(true)}
              className="min-h-11 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              恢复本机作答
            </button>
            <button
              type="button"
              onClick={() => resolveDraft(false)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              使用账号作答
            </button>
          </div>
        </section>
      )}
      {!online && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          网络已断开。
          {localDraftStored
            ? "答案已暂存在此浏览器，尚未保存到账号。"
            : "答案仍保留在本页，请保持页面打开。"}
          连接恢复后会重试保存。
        </p>
      )}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="font-semibold break-words">
            {submission.assignmentTitle}
          </h1>
          <p className="text-sm text-gray-500">
            第 {submission.attemptNumber} 次作答 · 已答 {answeredCount}/
            {submission.questions.length} · 截止{" "}
            {submission.dueAt
              ? new Date(submission.dueAt).toLocaleString("zh-CN")
              : "未设置"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
            disabled={editingDisabled || attachmentPending}
            onClick={() => void finish("exit")}
            type="button"
          >
            <Save aria-hidden="true" className="size-4" />
            {finalAction === "exit" ? "正在保存…" : "保存并退出"}
          </button>
          <button
            className="min-h-10 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
            disabled={editingDisabled || attachmentPending}
            onClick={() => void finish("submit")}
            type="button"
          >
            {finalAction === "submit" ? "提交中…" : "提交作业"}
          </button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-slate-600">
          <p role="status">
            {!ready
              ? "正在恢复作答，请稍候…"
              : attachmentPending
                ? "正在处理附件，请稍等。"
                : finalAction === "exit"
                  ? "正在保存草稿，保存成功后返回作业列表。"
                  : saveState === "saving"
                    ? "正在保存草稿…"
                    : saveState === "saved"
                      ? "已保存到账号，仍可继续作答。"
                      : pendingDraft
                        ? "选择恢复方式后可继续作答。"
                        : "修改后会自动保存，也可以保存并退出。"}
          </p>
          {saveState === "failed" && (
            <>
              <p role="alert" className="text-red-700">
                {saveError}
              </p>
              <p className="text-slate-600">
                {localDraftStored
                  ? "答案已暂存在此浏览器，尚未同步到账号。"
                  : "答案仍保留在本页，可重试保存。"}
              </p>
              {saveConflict && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="min-h-9 rounded-md px-2 font-medium text-sky-800 underline focus-visible:outline-2 focus-visible:outline-sky-700"
                >
                  重新载入账号作答
                </button>
              )}
              <button
                className="min-h-8 rounded-md px-2 font-medium text-sky-800 underline focus-visible:outline-2 focus-visible:outline-sky-700"
                disabled={Boolean(finalAction)}
                onClick={() => void persist()}
                type="button"
              >
                重试保存
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-6" inert={Boolean(finalAction)}>
        {hasQuestionNavigation && (
          <nav
            aria-label="题目导航"
            className="flex max-w-full flex-wrap gap-2 rounded-xl border bg-white p-4"
          >
            {submission.questions.map((question, index) => (
              <button
                aria-current={
                  index === activeQuestionIndex ? "step" : undefined
                }
                className={`min-w-10 rounded-md border px-3 py-2 text-sm ${
                  index === activeQuestionIndex
                    ? "border-sky-600 bg-sky-700 text-white"
                    : "bg-white hover:bg-sky-50/70"
                }`}
                key={question.id}
                disabled={editingDisabled}
                onClick={() => selectQuestion(index)}
                type="button"
              >
                {question.sortOrder}
              </button>
            ))}
          </nav>
        )}

        {submission.questions[activeQuestionIndex]
          ? (() => {
              const question = submission.questions[activeQuestionIndex];
              const answer = answers[question.id];
              const repeatedTitle =
                !hasQuestionNavigation &&
                question.title.trim() === submission.assignmentTitle.trim();
              return (
                <article
                  className="min-w-0 rounded-xl border bg-white p-4 sm:p-5"
                  key={question.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      {repeatedTitle ? (
                        <h2 className="font-medium">任务要求</h2>
                      ) : (
                        <h2 className="font-medium [overflow-wrap:anywhere]">
                          {hasQuestionNavigation && `${question.sortOrder}. `}
                          {question.title}
                        </h2>
                      )}
                      {!repeatedTitle && (
                        <p className="mt-1 text-sm text-gray-500">
                          {QUESTION_TYPE_LABELS[question.type]}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <FavoriteButton
                        source={{ kind: "ASSIGNMENT", id: question.id }}
                      />
                      <span className="text-sm text-gray-500">
                        {question.points} 分
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 min-w-0">
                    <QuestionText text={question.content} />
                  </div>
                  {question.images?.map((image) => (
                    <Image
                      alt={`第 ${question.sortOrder} 题附图`}
                      className="mt-3 max-h-[32rem] max-w-full rounded border object-contain"
                      key={image.id}
                      src={image.url}
                      width={800}
                      height={600}
                      unoptimized
                    />
                  ))}
                  {answer?.kind === "CODE" &&
                  question.type === QuestionType.PYTHON_PROGRAMMING ? (
                    <ProgrammingQuestionInput
                      assignmentQuestionId={question.id}
                      disabled={editingDisabled}
                      code={answer.value}
                      onChange={(code) =>
                        changeAnswer(question.id, { kind: "CODE", value: code })
                      }
                      submissionId={submission.id}
                    />
                  ) : answer ? (
                    <QuestionAnswerInput
                      answer={answer}
                      disabled={editingDisabled}
                      onChange={(nextAnswer) =>
                        changeAnswer(question.id, nextAnswer)
                      }
                      question={question}
                      roomy={
                        !hasQuestionNavigation &&
                        question.type === QuestionType.SHORT_ANSWER
                      }
                    />
                  ) : null}
                  {submission.allowAttachments &&
                    question.type === QuestionType.SHORT_ANSWER && (
                      <SubmissionAttachments
                        submissionId={submission.id}
                        questionId={question.id}
                        onPendingChange={setAttachmentPending}
                        editable={
                          submission.status === SubmissionStatus.IN_PROGRESS &&
                          !editingDisabled
                        }
                      />
                    )}
                </article>
              );
            })()
          : null}

        {hasQuestionNavigation && (
          <div className="flex items-center justify-between gap-3">
            <button
              className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
              disabled={
                attachmentPending ||
                editingDisabled ||
                activeQuestionIndex === 0
              }
              onClick={() => selectQuestion(activeQuestionIndex - 1)}
              type="button"
            >
              上一题
            </button>
            <span className="text-sm text-gray-500">
              {submission.questions.length === 0 ? 0 : activeQuestionIndex + 1}{" "}
              / {submission.questions.length}
            </span>
            <button
              className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
              disabled={
                attachmentPending ||
                editingDisabled ||
                activeQuestionIndex >= submission.questions.length - 1
              }
              onClick={() => selectQuestion(activeQuestionIndex + 1)}
              type="button"
            >
              下一题
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
