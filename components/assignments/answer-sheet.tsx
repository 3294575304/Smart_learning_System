"use client";

import {
  studentTaskHref,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";

import { FavoriteButton } from "@/components/question-favorites/favorite-button";
import { QuestionType, SubmissionStatus } from "@prisma/client";
import Image from "next/image";
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AnswerSheetPanel } from "@/components/assignments/answer-sheet-panel";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";

import { SubmissionAttachments } from "@/components/assignments/submission-attachments";
import { EditorDialog } from "@/components/assignments/editor-dialog";
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
  exam?: boolean;
  examLocked?: boolean;
  banner?: ReactNode;
  submission: {
    id: string;
    assignmentTitle: string;
    allowAttachments?: boolean;
    attemptNumber: number;
    status: SubmissionStatus;
    version: number;
    dueAt: Date | null;
    lastSavedAt?: Date | null;
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
  exam = false,
  examLocked = false,
  banner,
}: Props) {
  const router = useRouter();
  const storageKey = `assignment-draft:${submission.id}`;
  const [answers, setAnswers] = useState<AnswerMap>(() =>
    initialAnswers(submission.questions, submission.answers),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(
    submission.lastSavedAt ?? null,
  );
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [examConfirmation, setExamConfirmation] = useState(false);
  const questionPanel = useRef<HTMLElement>(null);
  const [finalAction, setFinalAction] = useState<FinalAction | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
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
  const firstUnsavedEditRef = useRef<number | null>(null);
  const queuedAutosaveRef = useRef(false);
  const examLockedRef = useRef(examLocked);
  const saveConflictRef = useRef(false);
  useEffect(() => {
    examLockedRef.current = examLocked;
  }, [examLocked]);
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
      if (
        examLockedRef.current ||
        saveConflictRef.current ||
        draftDecisionRef.current ||
        (finalActionRef.current && !finalizing)
      )
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
      firstUnsavedEditRef.current = null;
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
          saveConflictRef.current = exam && response.status === 409;
          return false;
        }
        versionRef.current = response.data.version;
        setLastSavedAt(new Date(response.data.lastSavedAt));
        setSaveConflict(false);
        setSaveState(latestAnswersRef.current === snapshot ? "saved" : "idle");
        if (latestAnswersRef.current === snapshot) {
          firstUnsavedEditRef.current = null;
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
    [clearLocalDraft, exam, persistLocalDraft, submission.id, timingTracker],
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
      examLocked ||
      finalActionRef.current ||
      draftDecisionRef.current
    )
      return;
    persistLocalDraft(latestAnswersRef.current, timingTracker.checkpoint());
    if (saveConflictRef.current) return;
    setSaveState("idle");
    const firstEdit = firstUnsavedEditRef.current;
    const delay =
      exam && firstEdit !== null
        ? Math.max(
            0,
            Math.min(
              autosaveDelayMs,
              800,
              3_000 - (performance.now() - firstEdit),
            ),
          )
        : autosaveDelayMs;
    const timer = window.setTimeout(() => {
      if (exam && queuedAutosaveRef.current) return;
      queuedAutosaveRef.current = exam;
      void persist().finally(() => {
        queuedAutosaveRef.current = false;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    answers,
    autosaveDelayMs,
    exam,
    examLocked,
    persist,
    persistLocalDraft,
    timingTracker,
  ]);

  async function finish(action: FinalAction) {
    if (
      !hydratedRef.current ||
      examLocked ||
      attachmentPending ||
      finalActionRef.current ||
      draftDecisionRef.current
    )
      return;
    if (action === "submit" && !exam) {
      const blank = submission.questions.filter((question) =>
        isBlankAnswer(answers[question.id]),
      ).length;
      const confirmation = `${blank ? `还有 ${blank} 题未作答。` : ""}确认提交作业？提交后本次答案将不能修改。`;
      if (!window.confirm(confirmation)) return;
    }
    finalActionRef.current = action;
    setFinalAction(action);
    try {
      if (!(await persist(true))) return;
      if (action === "exit") {
        leavingRef.current = true;
        window.location.replace(
          studentTaskHref(
            exam ? "/student/exams" : "/student/assignments?status=TODO",
            scope,
          ),
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
    if (examLocked || finalActionRef.current || draftDecisionRef.current)
      return;
    const updated = { ...latestAnswersRef.current, [questionId]: answer };
    latestAnswersRef.current = updated;
    if (exam) {
      firstUnsavedEditRef.current ??= performance.now();
      persistLocalDraft(updated, timingTracker.snapshot());
    }
    setAnswers(updated);
  }

  function focusQuestion() {
    window.requestAnimationFrame(() => {
      const panel = questionPanel.current;
      if (!panel) return;
      panel.scrollIntoView({ block: "start" });
      panel.focus({ preventScroll: true });
    });
  }

  function selectQuestion(nextIndex: number) {
    if (attachmentPending || finalActionRef.current) return;
    const nextQuestion = submission.questions[nextIndex];
    if (!nextQuestion) return;
    focusQuestion();
    if (nextIndex === activeQuestionIndex) return;
    timingTracker.activate(nextQuestion.id);
    setActiveQuestionIndex(nextIndex);
    void persist();
  }

  const hasQuestionNavigation = submission.questions.length > 1;
  const blankExamQuestions = exam
    ? submission.questions.flatMap((question, index) =>
        isBlankAnswer(answers[question.id])
          ? [{ number: question.sortOrder, index }]
          : [],
      )
    : [];
  const editingDisabled =
    examLocked || !ready || Boolean(pendingDraft) || Boolean(finalAction);

  const question = submission.questions[activeQuestionIndex];
  const answer = question ? answers[question.id] : undefined;
  const programming = question?.type === QuestionType.PYTHON_PROGRAMMING;
  const repeatedTitle =
    question &&
    !hasQuestionNavigation &&
    question.title.trim() === submission.assignmentTitle.trim();
  const totalQuestions = submission.questions.length;
  const totalPoints = useMemo(
    () =>
      submission.questions.reduce((sum, question) => sum + question.points, 0),
    [submission.questions],
  );
  const primaryDisabled = editingDisabled || attachmentPending;
  const answeredText = `已答 ${answeredCount}/${totalQuestions}`;

  // 顶栏只放「当前保存态」一个标记，详细文案仍在下一行，避免状态信息两处重复。
  const headerChip: { tone: StatusChipTone; label: string } = examLocked
    ? { tone: "neutral", label: "只读答卷" }
    : !ready
      ? { tone: "neutral", label: "正在恢复" }
      : saveState === "failed"
        ? { tone: "bad", label: "保存失败" }
        : attachmentPending
          ? { tone: "warn", label: "处理附件中" }
          : saveState === "saving"
            ? { tone: "brand", label: "正在保存" }
            : saveState === "saved"
              ? {
                  tone: "ok",
                  label: lastSavedAt
                    ? `已保存 ${lastSavedAt.toLocaleTimeString("zh-CN", {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "已保存",
                }
              : pendingDraft
                ? { tone: "warn", label: "待选择草稿" }
                : { tone: "neutral", label: "自动保存" };

  const sheetActions = (
    <>
      <button
        className="bg-brand hover:bg-brand-strong focus-visible:outline-brand min-h-11 w-full rounded-lg px-4 text-sm font-semibold text-white shadow-[0_4px_10px_-2px_rgb(1_105_161_/_0.22)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        disabled={primaryDisabled}
        onClick={() => {
          if (exam) setExamConfirmation(true);
          else void finish("submit");
        }}
        type="button"
      >
        {finalAction === "submit"
          ? exam
            ? "正在交卷…"
            : "提交中…"
          : exam
            ? "交卷"
            : "提交作业"}
      </button>
      <button
        className="text-brand-strong focus-visible:outline-brand min-h-10 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium transition-colors hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        disabled={primaryDisabled}
        onClick={() => void finish("exit")}
        type="button"
      >
        {finalAction === "exit" ? "正在保存…" : "保存并退出"}
      </button>
    </>
  );

  const answerCard = {
    activeIndex: activeQuestionIndex,
    answeredCount,
    disabled: editingDisabled,
    isAnswered: (questionId: string) => !isBlankAnswer(answers[questionId]),
    questions: submission.questions,
    totalPoints,
  };
  const submitNote = exam
    ? "交卷后答卷将锁定，不能再修改。"
    : "提交后本次答案不能修改。";

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
    <section className="space-y-4">
      {pendingDraft && !examLocked && (
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
          {examLocked
            ? "收卷以截止前同步到账号的答案为准。"
            : "连接恢复后会重试保存。"}
        </p>
      )}
      <div className="border-line bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="text-ink font-semibold break-words">
            {submission.assignmentTitle}
          </h1>
          <p className="text-ink-soft mt-1 text-xs">
            第 {submission.attemptNumber} 次作答 · {answeredText} · 截止{" "}
            {submission.dueAt
              ? new Date(submission.dueAt).toLocaleString("zh-CN")
              : "未设置"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={headerChip.tone}>{headerChip.label}</StatusChip>
          {exam && lastSavedAt && (
            <StatusChip tone="neutral">
              账号最近保存{" "}
              {lastSavedAt.toLocaleTimeString("zh-CN", { hour12: false })}
            </StatusChip>
          )}
          {examLocked ? <StatusChip tone="warn">已锁定</StatusChip> : null}
        </div>
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-slate-600">
          <p role="status">
            {examLocked
              ? "当前答卷只读。"
              : !ready
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
                disabled={
                  examLocked || (exam && saveConflict) || Boolean(finalAction)
                }
                onClick={() => void persist()}
                type="button"
              >
                重试保存
              </button>
            </>
          )}
        </div>
      </div>

      {banner && (
        <div className="sticky top-(--dashboard-header-height) z-10">
          {banner}
        </div>
      )}

      {exam && (
        <EditorDialog
          open={examConfirmation && !examLocked}
          title="确认交卷"
          busy={Boolean(finalAction)}
          onClose={() => setExamConfirmation(false)}
        >
          {blankExamQuestions.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm text-amber-900">
                还有 {blankExamQuestions.length} 题未作答，可选择题号返回检查。
              </p>
              <div
                className="mt-2 flex flex-wrap gap-2"
                aria-label="未作答题目"
              >
                {blankExamQuestions.map(({ number, index }) => (
                  <button
                    key={index}
                    type="button"
                    disabled={Boolean(finalAction)}
                    onClick={() => {
                      setExamConfirmation(false);
                      selectQuestion(index);
                    }}
                    className="min-h-10 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm text-amber-950 hover:bg-amber-100"
                  >
                    第 {number} 题
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-700">所有题目均已作答。</p>
          )}
          <p className="mt-3 text-sm text-slate-700">交卷后答卷将锁定。</p>
          {saveState === "failed" && saveError && (
            <p role="alert" className="mt-2 text-sm text-rose-800">
              {saveError}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={Boolean(finalAction)}
              onClick={() => setExamConfirmation(false)}
              className="min-h-10 rounded-lg border px-4 text-sm disabled:opacity-50"
            >
              继续作答
            </button>
            <button
              type="button"
              disabled={Boolean(finalAction)}
              onClick={() => void finish("submit")}
              className="min-h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {finalAction ? "正在交卷…" : "确认交卷"}
            </button>
          </div>
        </EditorDialog>
      )}

      <div
        className={
          programming
            ? "min-w-0"
            : "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_304px]"
        }
        inert={Boolean(finalAction)}
      >
        <div className="min-w-0 space-y-4">
          <div
            className={
              programming
                ? "flex flex-wrap items-center justify-between gap-3"
                : "flex flex-wrap items-center justify-between gap-3 lg:hidden"
            }
          >
            <p className="text-ink-soft text-sm font-medium">{answeredText}</p>
            <button
              aria-expanded={sheetOpen}
              aria-haspopup="dialog"
              className="border-line text-brand-strong bg-card focus-visible:outline-brand inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setSheetOpen(true)}
              type="button"
            >
              <LayoutGrid aria-hidden="true" className="size-4" />
              答题卡
            </button>
          </div>

          {question && (
            <article
              ref={questionPanel}
              tabIndex={-1}
              className="border-line bg-card min-w-0 scroll-mt-14 rounded-xl border p-4 shadow-[var(--shadow-card)] sm:p-6"
              key={question.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {hasQuestionNavigation ? (
                    <span
                      aria-hidden="true"
                      className="bg-brand-soft text-brand mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-[15px] font-semibold tabular-nums"
                    >
                      {question.sortOrder}
                    </span>
                  ) : null}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!repeatedTitle ? (
                        <StatusChip tone="neutral">
                          {QUESTION_TYPE_LABELS[question.type]}
                        </StatusChip>
                      ) : null}
                      {hasQuestionNavigation ? (
                        <span className="text-ink-muted text-xs tabular-nums">
                          第 {activeQuestionIndex + 1} 题 / 共 {totalQuestions}{" "}
                          题
                        </span>
                      ) : null}
                    </div>
                    {repeatedTitle ? (
                      <h2 className="text-ink mt-2 text-lg font-semibold">
                        任务要求
                      </h2>
                    ) : (
                      <h2 className="text-ink mt-2 text-xl leading-7 font-bold [overflow-wrap:anywhere]">
                        {question.title}
                      </h2>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ink-body text-[13px] font-semibold tabular-nums">
                    {question.points} 分
                  </span>
                  <FavoriteButton
                    source={{ kind: "ASSIGNMENT", id: question.id }}
                  />
                </div>
              </div>

              {programming && answer?.kind === "CODE" ? (
                <div className="border-line-soft mt-4 grid min-w-0 gap-4 border-t pt-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                  <section
                    aria-label="题目说明"
                    className="border-line bg-page min-w-0 rounded-xl border p-4 focus-visible:outline-2 focus-visible:outline-sky-700 xl:col-start-2 xl:row-start-1 xl:max-h-[34rem] xl:overflow-auto"
                    tabIndex={0}
                  >
                    <h3 className="text-ink mb-3 text-sm font-semibold">
                      题目说明
                    </h3>
                    <QuestionText text={question.content} />
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
                  </section>
                  <div className="min-w-0 xl:col-start-1 xl:row-start-1">
                    <ProgrammingQuestionInput
                      assignmentQuestionId={question.id}
                      disabled={editingDisabled}
                      code={answer.value}
                      onChange={(code) =>
                        changeAnswer(question.id, { kind: "CODE", value: code })
                      }
                      submissionId={submission.id}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-line-soft mt-4 min-w-0 border-t pt-5">
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

                  {answer && (
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
                  )}
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
                </>
              )}
            </article>
          )}

          {hasQuestionNavigation && (
            <div className="border-line bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 shadow-[var(--shadow-card)]">
              <button
                className="border-line text-ink-body focus-visible:outline-brand inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-[13px] font-medium transition-colors hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                disabled={
                  attachmentPending ||
                  editingDisabled ||
                  activeQuestionIndex === 0
                }
                onClick={() => selectQuestion(activeQuestionIndex - 1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
                上一题
              </button>
              <span className="text-ink-muted text-xs tabular-nums">
                第 {totalQuestions === 0 ? 0 : activeQuestionIndex + 1} /{" "}
                {totalQuestions} 题
              </span>
              <button
                className="border-line text-ink-body focus-visible:outline-brand inline-flex min-h-10 items-center gap-1 rounded-lg border px-3 text-[13px] font-medium transition-colors hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                disabled={
                  attachmentPending ||
                  editingDisabled ||
                  activeQuestionIndex >= totalQuestions - 1
                }
                onClick={() => selectQuestion(activeQuestionIndex + 1)}
                type="button"
              >
                下一题
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>
          )}

          <div
            className={
              programming
                ? "border-line bg-card rounded-xl border p-4"
                : "border-line bg-card rounded-xl border p-4 lg:hidden"
            }
          >
            <div className="flex flex-wrap justify-end gap-2 sm:[&>button]:w-auto">
              {sheetActions}
            </div>
            <p className="text-ink-soft mt-2 text-xs sm:text-right">
              {submitNote}
            </p>
          </div>
        </div>

        {!programming && (
          <aside className="hidden lg:sticky lg:top-[calc(var(--dashboard-header-height)+4rem)] lg:block lg:max-h-[calc(100dvh-var(--dashboard-header-height)-5rem)] lg:overflow-y-auto">
            <AnswerSheetPanel
              {...answerCard}
              footer={
                <>
                  {sheetActions}
                  <p className="text-ink-soft text-xs">{submitNote}</p>
                </>
              }
              onSelect={selectQuestion}
            />
          </aside>
        )}
      </div>

      <EditorDialog
        open={sheetOpen}
        title="答题卡"
        onClose={() => setSheetOpen(false)}
        showCloseButton
      >
        {sheetOpen && (
          <AnswerSheetPanel
            {...answerCard}
            showTitle={false}
            className="mt-3"
            onSelect={(index) => {
              selectQuestion(index);
              setSheetOpen(false);
            }}
          />
        )}
      </EditorDialog>
    </section>
  );
}
