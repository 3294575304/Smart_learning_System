"use client";

import {
  studentTaskHref,
  type StudentTaskScope,
} from "@/services/student-experience/task-scope";

import { FavoriteButton } from "@/components/question-favorites/favorite-button";
import { QuestionType, SubmissionStatus } from "@prisma/client";
import Image from "next/image";
import { ArrowLeft, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  AnswerQuestionHeading,
  ProgrammingAnswerLayout,
  StudentAnswerFooter,
  StudentAnswerWorkspace,
  answerPrimaryButton,
  answerQuestionCard,
  answerSecondaryButton,
} from "./student-answer-workspace";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";

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
import type {
  AutosaveAnswersData,
  SavedAnswerInput,
} from "@/services/assignments/schemas";
import { ProgrammingStatement } from "@/components/programming/programming-statement";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";

interface DraftQuestion {
  id: string;
  title: string;
  content: string;
  images?: Array<{ id: string; url: string }>;
  type: QuestionType;
  sortOrder: number;
  points: number;
  /** 编程题才有：冻结配置里的公开检查点，隐藏用例不会下发。 */
  programming?: {
    samples: Array<{ name: string; stdin: string; expectedOutput: string }>;
  } | null;
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
  exitHref?: string;
  exam?: boolean;
  examLocked?: boolean;
  examExit?: () => Promise<string | null>;
  examExitSnapshot?: RefObject<(() => AutosaveAnswersData | undefined) | null>;
  banner?: ReactNode;
  teacherResources?: ReactNode;
  submission: {
    id: string;
    assignmentTitle: string;
    allowAttachments?: boolean;
    attemptNumber: number;
    status: SubmissionStatus;
    version: number;
    dueAt: Date | null;
    canWrite?: boolean;
    writeBlockedReason?: string | null;
    serverNow?: Date;
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
  exitHref,
  exam = false,
  examLocked = false,
  examExit,
  examExitSnapshot,
  banner,
  teacherResources,
}: Props) {
  const [deadlineReached, setDeadlineReached] = useState(false);
  useEffect(() => {
    if (exam || !submission.dueAt) return;
    const remaining =
      new Date(submission.dueAt).getTime() -
      new Date(submission.serverNow ?? new Date()).getTime();
    const started = performance.now();
    const check = () =>
      setDeadlineReached(performance.now() - started >= remaining);
    check();
    const timer = window.setInterval(check, 1_000);
    return () => window.clearInterval(timer);
  }, [exam, submission.dueAt, submission.serverNow]);
  const workLocked =
    examLocked || submission.canWrite === false || deadlineReached;
  const blockedReason =
    submission.writeBlockedReason ??
    (deadlineReached
      ? "作业已截止。可以查看已保存的作答，如需补交请联系老师。"
      : "当前作答只供查看。");
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
  const [attachmentOperations, setAttachmentOperations] = useState(0);
  const attachmentPending = attachmentOperations > 0;
  const [examConfirmation, setExamConfirmation] = useState(false);
  const [examExitConfirmation, setExamExitConfirmation] = useState(false);
  const [examSubmitError, setExamSubmitError] = useState<string | null>(null);
  const questionPanel = useRef<HTMLElement>(null);
  const answerWorkspace = useRef<HTMLElement>(null);
  const examBanner = useRef<HTMLDivElement>(null);
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
  const savedAnswersRef = useRef(answers);
  const activeSaveRef = useRef<Promise<boolean> | null>(null);
  const firstUnsavedEditRef = useRef<number | null>(null);
  const queuedAutosaveRef = useRef(false);
  const workLockedRef = useRef(workLocked);
  const saveConflictRef = useRef(false);
  useEffect(() => {
    workLockedRef.current = workLocked;
  }, [workLocked]);
  useEffect(() => {
    const workspace = answerWorkspace.current;
    const stickyBanner = examBanner.current;
    if (!workspace || !stickyBanner) return;
    const measure = () => {
      workspace.style.setProperty(
        "--exam-banner-height",
        `${stickyBanner.getBoundingClientRect().height}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(stickyBanner);
    return () => observer.disconnect();
  }, [exam]);
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
      if (draftDecisionRef.current || workLockedRef.current) return;
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
        workLockedRef.current ||
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
          saveConflictRef.current = response.status === 409;
          if (response.status === 409) router.refresh();
          return false;
        }
        versionRef.current = response.data.version;
        savedAnswersRef.current = snapshot;
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
    [clearLocalDraft, persistLocalDraft, router, submission.id, timingTracker],
  );

  useEffect(() => {
    if (!examExitSnapshot) return;
    examExitSnapshot.current = () => {
      if (
        !hydratedRef.current ||
        workLockedRef.current ||
        draftDecisionRef.current ||
        saveConflictRef.current ||
        leavingRef.current ||
        latestAnswersRef.current === savedAnswersRef.current
      )
        return undefined;
      return {
        version: versionRef.current,
        answers: apiAnswers(
          latestAnswersRef.current,
          timingTracker.checkpoint(),
        ),
      };
    };
    return () => {
      examExitSnapshot.current = null;
    };
  }, [examExitSnapshot, timingTracker]);

  useEffect(() => {
    try {
      const local = workLockedRef.current
        ? null
        : localStorage.getItem(storageKey);
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
  }, [
    clearLocalDraft,
    storageKey,
    submission.questions,
    timingTracker,
    workLocked,
  ]);

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
    if (!firstQuestion || workLocked) return;
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
  }, [persistLocalDraft, submission.questions, timingTracker, workLocked]);

  useEffect(() => {
    if (
      !hydratedRef.current ||
      workLocked ||
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
    workLocked,
    persist,
    persistLocalDraft,
    timingTracker,
  ]);

  async function finish(action: FinalAction) {
    if (action === "exit" && workLocked) {
      leavingRef.current = true;
      router.push(
        exitHref ??
          studentTaskHref(
            exam ? "/student/exams" : "/student/assignments",
            scope,
          ),
      );
      return;
    }
    if (
      !hydratedRef.current ||
      workLocked ||
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
    if (exam && action === "submit") setExamSubmitError(null);
    finalActionRef.current = action;
    setFinalAction(action);
    try {
      if (!(await persist(true))) return;
      if (action === "exit") {
        if (examExit) {
          const error = await examExit();
          if (error) {
            setExamSubmitError(error);
            return;
          }
        }
        leavingRef.current = true;
        window.location.replace(
          (examExit
            ? studentTaskHref(
                `/student/submissions/${submission.id}/result`,
                scope,
              )
            : exitHref) ??
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
        if (exam) {
          setExamSubmitError(response.error);
          return;
        }
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
    if (workLocked || finalActionRef.current || draftDecisionRef.current)
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
    workLocked || !ready || Boolean(pendingDraft) || Boolean(finalAction);

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
  const headerChip: { tone: StatusChipTone; label: string } = workLocked
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

  const answerCard = {
    activeIndex: activeQuestionIndex,
    answeredCount,
    disabled: !ready || Boolean(finalAction) || attachmentPending,
    isAnswered: (questionId: string) => !isBlankAnswer(answers[questionId]),
    questions: submission.questions,
    groupByType: true,
    totalPoints,
  };
  const submitNote = exam
    ? examExit
      ? "退出会交卷，交卷后不能修改答案。"
      : "保存并退出后考试继续计时。交卷后答案不能修改。"
    : "提交后本次答案不能修改。";

  function requestExit() {
    if (examExit && !workLocked) {
      setExamSubmitError(null);
      setExamExitConfirmation(true);
    } else void finish("exit");
  }

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

  const saveNotice = (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-slate-600">
      <p role="status">
        {workLocked
          ? "当前作答只读。"
          : !ready
            ? "正在恢复作答，请稍候…"
            : attachmentPending
              ? "正在处理附件，请稍等。"
              : finalAction === "exit"
                ? exam
                  ? examExit
                    ? "正在保存作答并确认交卷。"
                    : "正在保存考试作答，保存成功后返回考试列表。"
                  : "正在保存草稿，保存成功后返回作业列表。"
                : saveState === "saving"
                  ? "正在保存草稿…"
                  : saveState === "saved"
                    ? "已保存到账号，仍可继续作答。"
                    : pendingDraft
                      ? "选择恢复方式后可继续作答。"
                      : examExit
                        ? "修改后会自动保存。本场考试退出时会交卷。"
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
            disabled={workLocked || saveConflict || Boolean(finalAction)}
            onClick={() => void persist()}
            type="button"
          >
            重试保存
          </button>
        </>
      )}
    </div>
  );
  const teacherResourceSection = teacherResources && (
    <div className="mt-4">{teacherResources}</div>
  );
  const questionContent = question && (
    <article
      ref={questionPanel}
      tabIndex={-1}
      className={cn(
        answerQuestionCard,
        exam &&
          "scroll-mt-[calc(var(--dashboard-header-height)+var(--exam-banner-height,0px)+0.75rem)]",
      )}
      aria-label={`第 ${question.sortOrder} 题：${question.title}`}
      key={question.id}
    >
      <AnswerQuestionHeading
        type={repeatedTitle ? undefined : QUESTION_TYPE_LABELS[question.type]}
        title={repeatedTitle ? "任务要求" : question.title}
        points={question.points}
        actions={
          <FavoriteButton source={{ kind: "ASSIGNMENT", id: question.id }} />
        }
      />

      {programming && answer?.kind === "CODE" ? (
        <ProgrammingAnswerLayout
          prompt={
            <>
              <ProgrammingStatement
                samples={question.programming?.samples ?? []}
                text={question.content}
              />
              {teacherResourceSection}
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
            </>
          }
        >
          <ProgrammingQuestionInput
            assignmentQuestionId={question.id}
            disabled={editingDisabled}
            fillHeight
            code={answer.value}
            onChange={(code) =>
              changeAnswer(question.id, { kind: "CODE", value: code })
            }
            submissionId={submission.id}
          />
        </ProgrammingAnswerLayout>
      ) : (
        <>
          <div className="border-line-soft mt-4 min-w-0 border-t pt-5">
            <QuestionText text={question.content} />
          </div>
          {teacherResourceSection}
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
              onChange={(nextAnswer) => changeAnswer(question.id, nextAnswer)}
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
                onPendingChange={(pending) =>
                  setAttachmentOperations((count) => count + (pending ? 1 : -1))
                }
                editable={
                  submission.status === SubmissionStatus.IN_PROGRESS &&
                  !editingDisabled
                }
              />
            )}
        </>
      )}
    </article>
  );

  return (
    <section
      ref={answerWorkspace}
      className="space-y-4"
      data-back-to-top-hidden={exam || undefined}
    >
      {workLocked && !exam && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {blockedReason}{" "}
          以最近一次成功保存的内容为准，未同步的修改可在获准补交后恢复。
        </p>
      )}
      {pendingDraft && !workLocked && (
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
          {workLocked
            ? "请以已保存到账号的作答为准。"
            : "连接恢复后会重试保存。"}
        </p>
      )}
      {banner && (
        <div
          ref={exam ? examBanner : undefined}
          className="sticky top-(--dashboard-header-height) z-10"
        >
          {banner}
        </div>
      )}

      {exam && (
        <EditorDialog
          open={examConfirmation && !workLocked}
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
          {examSubmitError && (
            <p role="alert" className="mt-2 text-sm text-rose-800">
              未能确认交卷。{examSubmitError} 请重试确认交卷。
            </p>
          )}
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

      {examExit && (
        <EditorDialog
          open={examExitConfirmation && !workLocked}
          title="确认退出并交卷"
          busy={Boolean(finalAction)}
          onClose={() => setExamExitConfirmation(false)}
        >
          <p className="mt-3 text-sm">
            退出会提交这次答卷，之后不能修改答案。
            {blankExamQuestions.length > 0 &&
              `还有 ${blankExamQuestions.length} 题未作答。`}
          </p>
          {(examSubmitError || (saveState === "failed" && saveError)) && (
            <p role="alert" className="mt-2 text-sm text-rose-800">
              {examSubmitError || saveError}。请检查网络后重试。
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={answerSecondaryButton}
              disabled={Boolean(finalAction)}
              onClick={() => setExamExitConfirmation(false)}
            >
              继续作答
            </button>
            <button
              type="button"
              className={answerPrimaryButton}
              disabled={Boolean(finalAction)}
              onClick={() => {
                setExamSubmitError(null);
                void finish("exit");
              }}
            >
              {finalAction ? "正在确认交卷…" : "退出并交卷"}
            </button>
          </div>
        </EditorDialog>
      )}
      <StudentAnswerWorkspace
        busy={Boolean(finalAction)}
        firstUnanswered={
          exam ? (blankExamQuestions[0]?.index ?? -1) : undefined
        }
        header={{
          title: submission.assignmentTitle,
          details: (
            <>
              第 {activeQuestionIndex + 1} / {totalQuestions} 题 ·{" "}
              {answeredText} · 第 {submission.attemptNumber} 次作答
              {submission.dueAt && (
                <>
                  {" "}
                  · 截止 {new Date(submission.dueAt).toLocaleString("zh-CN")}
                </>
              )}
            </>
          ),
          leading: (
            <button
              className={answerSecondaryButton}
              disabled={Boolean(finalAction) || attachmentPending}
              onClick={requestExit}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              {workLocked
                ? "返回列表"
                : examExit
                  ? "退出并交卷"
                  : exam
                    ? "退出考试"
                    : "退出作答"}
            </button>
          ),
          actions: (
            <StatusChip tone={headerChip.tone}>{headerChip.label}</StatusChip>
          ),
          status: exam ? (
            <>
              {totalQuestions > 0 && (
                <div
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                  aria-label="考试作答进度"
                >
                  <span>
                    已答 {answeredCount} · 未答 {totalQuestions - answeredCount}
                  </span>
                  <progress
                    className="accent-brand h-2 w-28"
                    aria-label="已作答题数"
                    value={answeredCount}
                    max={totalQuestions}
                  />
                </div>
              )}
              {saveNotice}
            </>
          ) : (
            saveNotice
          ),
        }}
        navigator={{
          ...answerCard,
          onSelect: selectQuestion,
          progressLabel: "已作答",
        }}
      >
        {questionContent}
        <StudentAnswerFooter
          current={activeQuestionIndex}
          total={totalQuestions}
          disabled={answerCard.disabled}
          onSelect={selectQuestion}
          note={workLocked ? undefined : submitNote}
          actions={
            !workLocked && (
              <>
                <button
                  className={answerSecondaryButton}
                  disabled={Boolean(finalAction) || attachmentPending}
                  onClick={requestExit}
                  type="button"
                >
                  <Save aria-hidden="true" className="size-4" />
                  {finalAction === "exit"
                    ? examExit
                      ? "正在确认交卷…"
                      : "正在保存…"
                    : examExit
                      ? "退出并交卷"
                      : "保存并退出"}
                </button>
                <button
                  className={answerPrimaryButton}
                  disabled={primaryDisabled}
                  onClick={() => {
                    if (exam) {
                      setExamSubmitError(null);
                      setExamConfirmation(true);
                    } else void finish("submit");
                  }}
                  type="button"
                >
                  <Send aria-hidden="true" className="size-4" />
                  {exam
                    ? finalAction === "submit"
                      ? "正在交卷…"
                      : "交卷"
                    : finalAction === "submit"
                      ? "提交中…"
                      : "提交作业"}
                </button>
              </>
            )
          }
        />
      </StudentAnswerWorkspace>
    </section>
  );
}
