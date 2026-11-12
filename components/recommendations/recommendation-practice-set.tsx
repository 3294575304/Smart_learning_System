"use client";
import { summarizePracticeScores } from "@/services/recommendations/scoring";
import { PracticeManagementActions } from "./practice-management-actions";
import { PracticeHistoryQuestion } from "./practice-history-question";
import { canAnswerPractice } from "@/services/practice-sets/types";
import { useSearchParams } from "next/navigation";
import { practiceListReturnUrl } from "@/services/practice-sets/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Save,
  Send,
} from "lucide-react";
import { usePracticeAccountDraft } from "./use-practice-account-draft";
import {
  missingPracticeAnswers,
  practiceAnswerRequired,
  practiceDraftFilled,
  type PracticeDraft,
} from "@/services/practice-sets/submission";
import { requestApi } from "@/components/courses/request-api";
import { RecommendationPractice } from "./recommendation-practice";
import {
  startRecommendationRequest,
  recommendationDetailApiPath,
  submitRecommendationPracticeRequest,
  submitRecommendationProgrammingRequest,
} from "@/lib/api/recommendations";
import type { PracticeSet } from "@/services/practice-sets/types";
import type { RecommendationDetailView } from "@/services/recommendations/types";

const controlClass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-800 disabled:opacity-50";
const secondaryClass = `${controlClass} border-slate-300 bg-white text-cyan-950 hover:bg-cyan-50`;

function questionState(
  question: PracticeSet["questions"][number],
  draft: PracticeDraft | undefined,
  missing: boolean,
) {
  if (question.status === "COMPLETED")
    return {
      label: "已提交",
      mark: "✓",
      color: "bg-emerald-50 text-emerald-800",
    };
  if (
    question.judgingStatus === "PENDING" ||
    question.judgingStatus === "RUNNING"
  )
    return { label: "待判", mark: "…", color: "bg-violet-50 text-violet-800" };
  if (question.judgingStatus)
    return {
      label: "判题异常",
      mark: "!",
      color: "bg-amber-50 text-amber-900",
    };
  if (missing)
    return {
      label: "必答未填",
      mark: "!",
      color: "border-red-400 bg-red-50 text-red-800",
    };
  if (practiceDraftFilled(draft))
    return { label: "草稿", mark: "✎", color: "bg-sky-50 text-sky-800" };
  return { label: "未答", mark: "–", color: "bg-white text-slate-700" };
}
export function RecommendationPracticeSet({
  set,
  initialRecommendation,
}: {
  set: PracticeSet;
  initialRecommendation: RecommendationDetailView;
}) {
  const searchParams = useSearchParams();
  const returnTo = practiceListReturnUrl(searchParams?.get("returnTo"));
  const initialQuestion = useRef(searchParams?.get("question")).current;
  const [questions, setQuestions] = useState(set.questions);
  const readOnly = !questions.some(canAnswerPractice);
  const [current, setCurrent] = useState(
    set.questions.some((q) => q.id === initialQuestion)
      ? (initialQuestion ?? initialRecommendation.id)
      : initialRecommendation.id,
  );
  const draft = usePracticeAccountDraft(
    set,
    initialQuestion,
    setCurrent,
    returnTo,
  );
  const {
    drafts,
    setDrafts,
    ready: draftsReady,
    keys,
    cache: cacheDraft,
  } = draft;
  useEffect(() => {
    if (!draftsReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set("question", current);
    window.history.replaceState(window.history.state, "", url);
  }, [current, draftsReady]);
  const [cache, setCache] = useState<Record<string, RecommendationDetailView>>({
    [initialRecommendation.id]: initialRecommendation,
  });
  const [busy, setBusy] = useState(
    initialRecommendation.status === "PENDING" &&
      !initialRecommendation.readOnly,
  );
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [batchBusy, setBatchBusy] = useState(false);
  const [submittingItems, setSubmittingItems] = useState<
    Record<string, boolean>
  >({});
  const singleBusy = Object.values(submittingItems).some(Boolean);
  const onSubmissionStateChange = useCallback(
    (id: string, pending: boolean) => {
      setSubmittingItems((previous) => ({ ...previous, [id]: pending }));
    },
    [],
  );
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchMessage, setBatchMessage] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const viewQuestions = questions.map((q) => {
    const detail = cache[q.id];
    const result = detail?.practiceResult;
    return {
      ...q,
      status:
        q.status === "COMPLETED" ? q.status : (detail?.status ?? q.status),
      readOnly: q.readOnly || detail?.readOnly,
      score: result?.score ?? q.score,
      maxScore: result?.maxScore ?? q.maxScore,
      assignedPoints: detail?.assignedPoints ?? q.assignedPoints,
      judgingStatus: detail?.programmingAttempt?.status ?? q.judgingStatus,
    };
  });
  const pending = viewQuestions.filter(
    (q) => canAnswerPractice(q) && !q.judgingStatus,
  );
  const working = batchBusy || singleBusy || draft.saving;
  const saveSnapshot = {
    current,
    drafts: Object.fromEntries(
      pending.filter((q) => drafts[q.id]).map((q) => [q.id, drafts[q.id]]),
    ),
  };
  useEffect(() => {
    if (!draftsReady || readOnly) return;
    const save = () => cacheDraft(saveSnapshot);
    save();
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  });
  const onDraftChange = useCallback(
    (id: string, answer: PracticeDraft) => {
      setDrafts((previous) => ({ ...previous, [id]: answer }));
      setMissing((previous) => previous.filter((item) => item !== id));
    },
    [setDrafts],
  );
  async function submitAll() {
    if (
      readOnly ||
      working ||
      !draftsReady ||
      draft.conflict ||
      !pending.length
    )
      return;
    const unanswered = missingPracticeAnswers(pending, drafts);
    if (unanswered.length) {
      setMissing(unanswered);
      setCurrent(unanswered[0]);
      setBatchMessage(
        `还有 ${unanswered.length} 道选择或判断题未作答，请完成标记题目后提交。`,
      );
      return;
    }
    if (
      pending.some(
        (q) => q.type === "SHORT_ANSWER" && practiceDraftFilled(drafts[q.id]),
      )
    ) {
      setBatchMessage(
        "当前自主练习尚未开放非空简答题评分，不能自动判 0 分。请保留答案并联系教师；空白简答题可按 0 分提交。",
      );
      return;
    }
    const blank = pending.filter(
      (q) =>
        !practiceAnswerRequired(q.type) &&
        !practiceDraftFilled(drafts[q.id]) &&
        !cache[q.id]?.programmingAttempt,
    );
    if (
      !window.confirm(
        `确认提交剩余 ${pending.length} 道题？${blank.length ? `其中 ${blank.length} 道空白题按 0 分提交。` : ""}提交后答案不可修改；编程题异步判题，不计入正式课程成绩。`,
      )
    )
      return;
    setBatchBusy(true);
    setBatchProgress(0);
    setBatchTotal(pending.length);
    setBatchMessage("");
    try {
      for (const q of pending) {
        let item = cache[q.id];
        const loaded = await requestApi<RecommendationDetailView>(
          recommendationDetailApiPath(q.id),
          { method: "GET" },
        );
        if (!loaded.success) throw new Error(loaded.error);
        item = loaded.data;
        if (item.status === "PENDING") {
          const started = await startRecommendationRequest(q.id);
          if (!started.success) throw new Error(started.error);
          item = started.data;
        }
        if (item.status !== "COMPLETED") {
          if (item.status !== "STARTED")
            throw new Error("练习已结束，请刷新查看最新状态。");
          const answer = drafts[q.id] ?? { kind: "TEXT" as const, value: "" };
          const key =
            keys.current[q.id] ?? (keys.current[q.id] = crypto.randomUUID());
          // Persist before sending so a reload during a request can reuse its key.
          cacheDraft(saveSnapshot);
          if (q.type === "PYTHON_PROGRAMMING" && item.programmingAttempt) {
            // 已排队或失败的判题保留原结果，交由现有判题面板恢复。
          } else if (answer.kind === "CODE" && answer.value.trim()) {
            const submitted = await submitRecommendationProgrammingRequest(
              q.id,
              { sourceCode: answer.value, idempotencyKey: key },
            );
            if (!submitted.success) throw new Error(submitted.error);
            item = {
              ...item,
              programmingAttempt: {
                id: submitted.data.attemptId,
                status: submitted.data.status,
                progress: 0,
              },
            };
          } else {
            if (answer.kind === "BOOLEAN" && answer.value === null)
              throw new Error("请完成判断题。");
            const payload =
              answer.kind === "CHOICE"
                ? {
                    questionId: item.questionId,
                    kind: "CHOICE" as const,
                    optionIds: answer.optionIds,
                  }
                : answer.kind === "BOOLEAN"
                  ? {
                      questionId: item.questionId,
                      kind: "BOOLEAN" as const,
                      value: answer.value as boolean,
                    }
                  : {
                      questionId: item.questionId,
                      kind: "TEXT" as const,
                      value: answer.value,
                    };
            const submitted = await submitRecommendationPracticeRequest(q.id, {
              idempotencyKey: key,
              answers: [payload],
            });
            if (!submitted.success) throw new Error(submitted.error);
            item = {
              ...item,
              status: "COMPLETED",
              practiceResult: submitted.data,
            };
          }
        }
        setCache((previous) => ({ ...previous, [q.id]: item }));
        setQuestions((previous) =>
          previous.map((entry) =>
            entry.id === q.id ? { ...entry, status: item.status } : entry,
          ),
        );
        setBatchProgress((previous) => previous + 1);
      }
      setBatchMessage(
        "本组答案已提交。普通题已判分；如有编程题，请在题号中查看异步判题进度。可切换题号查看答案与解析。",
      );
    } catch (error) {
      setBatchMessage(
        `${error instanceof Error ? error.message : "提交失败"} 已成功的题目不会重复提交，答案仍保留，可重试提交剩余题目。`,
      );
    } finally {
      setBatchBusy(false);
    }
  }
  const scoring = summarizePracticeScores(viewQuestions);
  const judgingIds = viewQuestions
    .filter(
      (item) =>
        item.status !== "COMPLETED" &&
        ["PENDING", "RUNNING"].includes(item.judgingStatus ?? ""),
    )
    .map((item) => item.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!judgingIds) return;
    let alive = true;
    let loading = false;
    async function refreshJudging() {
      if (loading) return;
      loading = true;
      try {
        const details = await Promise.all(
          judgingIds
            .split(",")
            .map((id) =>
              requestApi<RecommendationDetailView>(
                recommendationDetailApiPath(id),
                { method: "GET" },
              ),
            ),
        );
        if (!alive) return;
        for (const response of details)
          if (response.success) {
            const detail = response.data;
            setCache((previous) => ({ ...previous, [detail.id]: detail }));
            setQuestions((previous) =>
              previous.map((q) =>
                q.id === detail.id ? { ...q, status: detail.status } : q,
              ),
            );
          }
      } finally {
        loading = false;
      }
    }
    const timer = window.setInterval(() => {
      void refreshJudging();
    }, 1500);
    window.addEventListener("focus", refreshJudging);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshJudging);
    };
  }, [judgingIds]);
  const index = questions.findIndex((q) => q.id === current);
  const submitted = viewQuestions.filter(
    (q) => q.status === "COMPLETED" || q.judgingStatus,
  ).length;
  const cachedCurrent = cache[current];
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  function goToQuestion(id: string) {
    if (id === current) {
      questionHeading.current?.focus();
    } else {
      moveFocus.current = true;
      setCurrent(id);
    }
    setNavigatorOpen(false);
  }
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    questionHeading.current?.focus();
  }, [current]);
  useEffect(() => {
    if (!draftsReady) return;
    let alive = true;
    async function load() {
      const entry = cachedCurrent;
      if (entry && (entry.status !== "PENDING" || entry.readOnly)) {
        setBusy(false);
        setError("");
        return;
      }
      setBusy(true);
      setError("");
      let response = await requestApi<RecommendationDetailView>(
        recommendationDetailApiPath(current),
        { method: "GET" },
      );
      if (
        response.success &&
        response.data.status === "PENDING" &&
        !response.data.readOnly
      )
        response = await startRecommendationRequest(current);
      if (!alive) return;
      setBusy(false);
      if (!response.success) {
        setError(response.error);
        return;
      }
      setCache((previous) => ({ ...previous, [current]: response.data }));
      setQuestions((previous) =>
        previous.map((q) =>
          q.id === current
            ? {
                ...q,
                status: response.data.status,
                readOnly: response.data.readOnly,
              }
            : q,
        ),
      );
    }
    void load();
    return () => {
      alive = false;
    };
  }, [current, retry, cachedCurrent, draftsReady]);
  return (
    <section className="@container mx-auto max-w-7xl min-w-0 rounded-xl border border-slate-200 bg-slate-100">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-slate-200 bg-white px-3 py-3 sm:px-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
          {readOnly ? (
            <a href={returnTo} className={secondaryClass}>
              <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
              返回自主练习
            </a>
          ) : (
            <button
              type="button"
              className={secondaryClass}
              disabled={!draftsReady || working || Boolean(draft.conflict)}
              onClick={() => void draft.saveAndExit(saveSnapshot)}
            >
              <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
              {draft.saving ? "保存中…" : "退出练习"}
            </button>
          )}
          <div className="max-w-56 min-w-0 flex-[1_1_10rem]">
            <p className="text-xs text-slate-700 tabular-nums">
              第 {index + 1} / {questions.length} 题 · 已提交 {submitted}/
              {questions.length}
            </p>
            {!readOnly && (
              <progress
                aria-label="练习提交进度"
                max={questions.length}
                value={submitted}
                className="mt-1 block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-slate-200 [&::-moz-progress-bar]:bg-cyan-900 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-cyan-900"
              />
            )}
          </div>
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-xs [overflow-wrap:anywhere] text-slate-600">
              {set.courseName}
            </p>
            <h1 className="text-lg leading-7 font-semibold [overflow-wrap:anywhere] text-slate-950">
              {set.title}
            </h1>
            {readOnly && (
              <p className="text-xs text-slate-600">
                {set.management?.trashedAt
                  ? "回收站 · 只读回看"
                  : "练习记录 · 只读回看"}
              </p>
            )}
          </div>
        </div>
        <div inert={working}>
          <PracticeManagementActions
            id={initialRecommendation.id}
            title={set.title}
            management={set.management}
            active={!readOnly}
            menuLabel="更多"
            onChange={(action) => {
              if (action === "PURGE")
                window.location.replace(
                  returnTo === "/student/recommendations"
                    ? "/student/recommendations?view=recommended&section=TRASH"
                    : returnTo,
                );
              else window.location.reload();
            }}
          />
        </div>
      </header>

      <div className="grid min-w-0 @min-[48rem]:grid-cols-[minmax(0,1fr)_14rem]">
        <aside
          aria-labelledby="practice-progress"
          className="min-w-0 border-b border-slate-200 bg-white p-3 sm:p-4 @min-[48rem]:sticky @min-[48rem]:top-20 @min-[48rem]:col-start-2 @min-[48rem]:row-start-1 @min-[48rem]:border-s @min-[48rem]:border-b-0"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="practice-progress"
              className="text-sm font-semibold text-slate-950"
            >
              答题卡
            </h2>
            <p className="text-xs text-slate-600 tabular-nums">
              已提交 {submitted}/{questions.length}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-slate-600">
            {scoring.pendingCount > 0 && (
              <span>待判 {scoring.pendingCount}</span>
            )}
            {scoring.errorCount > 0 && (
              <span className="text-amber-900">
                判题异常 {scoring.errorCount}
              </span>
            )}
            {scoring.gradedCount > 0 && (
              <span aria-live="polite" className="font-medium text-slate-900">
                {scoring.complete && scoring.percentage !== null
                  ? "整组成绩 " + scoring.percentage + " 分"
                  : "已评 " + scoring.gradedScore + " 分"}
              </span>
            )}
            {readOnly && scoring.gradedCount === 0 && <span>暂无已评成绩</span>}
            <span>
              {scoring.frozen
                ? "总分 " + scoring.totalPoints + " 分"
                : "保留原始分值"}
            </span>
            <span>不计课程成绩</span>
          </div>
          <button
            type="button"
            aria-expanded={navigatorOpen}
            aria-controls="practice-question-navigator"
            className={
              secondaryClass +
              " mt-3 w-full justify-between @min-[48rem]:hidden"
            }
            onClick={() => setNavigatorOpen((open) => !open)}
          >
            {navigatorOpen ? "收起题号" : "展开题号"}
            <ChevronDown
              aria-hidden="true"
              className={"size-4 " + (navigatorOpen ? "rotate-180" : "")}
            />
          </button>
          <nav
            id="practice-question-navigator"
            aria-label="题号导航"
            className={
              (navigatorOpen ? "block" : "hidden") +
              " mt-3 border-t pt-3 @min-[48rem]:block"
            }
          >
            <div className="grid max-h-64 grid-cols-5 gap-1.5 overflow-y-auto px-1 py-1 sm:grid-cols-8 @min-[48rem]:grid-cols-4">
              {viewQuestions.map((question, i) => {
                const state = questionState(
                  question,
                  drafts[question.id],
                  missing.includes(question.id),
                );
                const selected = question.id === current;
                return (
                  <button
                    key={question.id}
                    type="button"
                    disabled={working || !draftsReady}
                    aria-label={"第 " + (i + 1) + " 题，" + state.label}
                    aria-current={selected ? "step" : undefined}
                    title={state.label}
                    onClick={() => goToQuestion(question.id)}
                    className={
                      "min-h-11 rounded-lg border text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-700 disabled:opacity-60 " +
                      (selected
                        ? "border-cyan-950 bg-cyan-900 text-white"
                        : state.color)
                    }
                  >
                    {i + 1} <span aria-hidden="true">{state.mark}</span>
                  </button>
                );
              })}
            </div>
            <p
              aria-hidden="true"
              className="mt-2 text-xs leading-5 text-slate-600"
            >
              – 未答　✎ 草稿　… 待判　✓ 已提交　! 需查看
            </p>
          </nav>
        </aside>

        <div className="min-w-0 space-y-3 p-3 sm:p-5 @min-[48rem]:col-start-1 @min-[48rem]:row-start-1">
          <div className="mx-auto max-w-3xl min-w-0 rounded-lg p-1 sm:p-3">
            <h2
              ref={questionHeading}
              tabIndex={-1}
              className="mb-2 scroll-mt-24 rounded text-sm font-semibold text-cyan-950 focus-visible:outline-2 focus-visible:outline-cyan-800"
            >
              第 {index + 1} / {questions.length} 题
            </h2>
            {cachedCurrent && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="rounded bg-cyan-100 px-2 py-1 font-medium text-cyan-950">
                  {QUESTION_TYPE_LABELS[cachedCurrent.type]}
                </span>
                {cachedCurrent.assignedPoints != null && (
                  <span>{cachedCurrent.assignedPoints} 分</span>
                )}
                {cachedCurrent.knowledgePoints.length > 0 && (
                  <span className="[overflow-wrap:anywhere]">
                    知识点 ·{" "}
                    {cachedCurrent.knowledgePoints
                      .map((point) => point.name)
                      .join("、")}
                  </span>
                )}
              </div>
            )}
            {((!readOnly && !draftsReady) || busy) && (
              <p role="status" className="py-4 text-sm text-slate-600">
                正在加载题目…
              </p>
            )}
            {error && (
              <p role="alert" className="py-4 text-sm text-red-700">
                {error}{" "}
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={() => setRetry((value) => value + 1)}
                >
                  重试
                </button>
              </p>
            )}
            {(draftsReady || readOnly) &&
              Object.values(cache).map((item) => (
                <div
                  key={
                    item.id +
                    ":" +
                    item.status +
                    ":" +
                    (item.programmingAttempt?.id ?? "") +
                    ":" +
                    draft.inputVersion
                  }
                  hidden={item.id !== current || busy || Boolean(error)}
                >
                  <fieldset
                    className="min-w-0"
                    disabled={
                      batchBusy || draft.saving || Boolean(draft.conflict)
                    }
                  >
                    {!readOnly &&
                    item.status === "STARTED" &&
                    !item.readOnly ? (
                      <RecommendationPractice
                        embedded
                        recommendation={item}
                        initialAnswer={drafts[item.id]}
                        onDraftChange={onDraftChange}
                        onSubmissionStateChange={onSubmissionStateChange}
                        onProgrammingQueued={(id, attempt) =>
                          setCache((previous) =>
                            previous[id]
                              ? {
                                  ...previous,
                                  [id]: {
                                    ...previous[id],
                                    programmingAttempt: attempt,
                                  },
                                }
                              : previous,
                          )
                        }
                        batchBusy={batchBusy}
                        onCompleted={(id) => {
                          setQuestions((previous) =>
                            previous.map((q) =>
                              q.id === id ? { ...q, status: "COMPLETED" } : q,
                            ),
                          );
                          void requestApi<RecommendationDetailView>(
                            recommendationDetailApiPath(id),
                            { method: "GET" },
                          ).then((response) => {
                            if (response.success)
                              setCache((previous) => ({
                                ...previous,
                                [id]: response.data,
                              }));
                          });
                        }}
                      />
                    ) : (
                      <PracticeHistoryQuestion
                        item={item}
                        draft={drafts[item.id]}
                        embedded
                      />
                    )}
                  </fieldset>
                </div>
              ))}
          </div>

          {(draft.error || draft.message || batchMessage) && (
            <div className="space-y-2 rounded-xl border bg-white px-4 py-3 text-sm">
              {batchMessage && (
                <p role="status" className="text-slate-700">
                  {batchMessage}
                </p>
              )}
              {draft.error ? (
                <>
                  <p role="alert" className="text-red-700">
                    {draft.error}
                  </p>
                  {!readOnly && (
                    <p className="text-slate-600">
                      答案仍保留在本页，可直接重试保存。
                    </p>
                  )}
                </>
              ) : (
                <p role="status" className="text-slate-600">
                  {draft.message}
                </p>
              )}
              {draft.conflict && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={working}
                    className={secondaryClass}
                    onClick={() => {
                      draft.useServerDraft();
                      setMissing([]);
                    }}
                  >
                    载入账号草稿
                  </button>
                  <button
                    type="button"
                    disabled={working || !pending.length}
                    className={secondaryClass}
                    onClick={() => {
                      if (window.confirm("用当前答案覆盖账号草稿并退出？"))
                        void draft.saveAndExit(saveSnapshot, true);
                    }}
                  >
                    覆盖并保存退出
                  </button>
                </div>
              )}
              {readOnly && draft.error && (
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={() => window.location.reload()}
                >
                  重试读取
                </button>
              )}
            </div>
          )}
          <footer className="sticky bottom-0 z-10 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-2 shadow-sm sm:p-3">
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <button
                type="button"
                className={secondaryClass}
                disabled={!draftsReady || working || index <= 0}
                onClick={() => goToQuestion(questions[index - 1].id)}
              >
                <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
                上一题
              </button>
              <button
                type="button"
                className={secondaryClass}
                disabled={
                  !draftsReady || working || index >= questions.length - 1
                }
                onClick={() => goToQuestion(questions[index + 1].id)}
              >
                下一题
                <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
              </button>
            </div>
            {!readOnly && pending.length > 0 && (
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                <button
                  type="button"
                  className={secondaryClass}
                  disabled={!draftsReady || working || Boolean(draft.conflict)}
                  onClick={() => void draft.saveAndExit(saveSnapshot)}
                >
                  <Save aria-hidden="true" className="size-4 shrink-0" />
                  {draft.saving ? "保存中…" : "保存并退出"}
                </button>
                <button
                  type="button"
                  className={
                    controlClass +
                    " border-cyan-900 bg-cyan-900 text-white hover:bg-cyan-950"
                  }
                  disabled={
                    !draftsReady || working || busy || Boolean(draft.conflict)
                  }
                  onClick={() => void submitAll()}
                >
                  <Send aria-hidden="true" className="size-4 shrink-0" />
                  {batchBusy
                    ? "提交 " + batchProgress + "/" + batchTotal
                    : "提交练习"}
                </button>
              </div>
            )}
          </footer>
        </div>
      </div>
    </section>
  );
}
