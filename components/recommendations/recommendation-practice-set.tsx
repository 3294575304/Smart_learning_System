"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { parsePracticeDraft } from "@/services/practice-sets/draft-storage";
import { useNavigationUserId } from "@/components/dashboard/navigation-memory";
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
export function RecommendationPracticeSet({
  set,
  initialRecommendation,
}: {
  set: PracticeSet;
  initialRecommendation: RecommendationDetailView;
}) {
  const [questions, setQuestions] = useState(set.questions);
  const [current, setCurrent] = useState(initialRecommendation.id);
  const [cache, setCache] = useState<Record<string, RecommendationDetailView>>({
    [initialRecommendation.id]: initialRecommendation,
  });
  const [busy, setBusy] = useState(initialRecommendation.status === "PENDING");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, PracticeDraft>>({});
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
  const keys = useRef<Record<string, string>>({});
  const [draftsReady, setDraftsReady] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  const userId = useNavigationUserId();
  const storageKey = `practice-draft:v1:${userId}:${set.id}`;
  useEffect(() => {
    try {
      if (!userId) return;
      const saved = parsePracticeDraft(
        JSON.parse(sessionStorage.getItem(storageKey) ?? "null"),
        set.questions.filter((q) => q.status !== "COMPLETED").map((q) => q.id),
      );
      if (saved) {
        setDrafts(saved.drafts);
        keys.current = saved.keys;
        if (saved.current) setCurrent(saved.current);
        setStorageMessage(
          "已恢复本标签页的未提交答案；已提交题目以服务器结果为准。",
        );
      }
    } catch {
      setStorageMessage("浏览器无法恢复草稿，请及时提交答案。");
    } finally {
      setDraftsReady(true);
    }
  }, [storageKey, set.questions, userId]);
  useEffect(() => {
    if (!draftsReady || !userId) return;
    const save = () => {
      try {
        const pending = questions.filter((q) => q.status !== "COMPLETED");
        if (!pending.length) sessionStorage.removeItem(storageKey);
        else
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({
              at: Date.now(),
              current,
              keys: keys.current,
              drafts: Object.fromEntries(
                pending
                  .filter((q) => drafts[q.id])
                  .map((q) => [q.id, drafts[q.id]]),
              ),
            }),
          );
      } catch {
        setStorageMessage(
          "浏览器草稿保存不可用，请及时提交；当前页面答案仍保留。",
        );
      }
    };
    save();
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [draftsReady, drafts, current, questions, storageKey, userId]);
  const onDraftChange = useCallback((id: string, answer: PracticeDraft) => {
    setDrafts((previous) => ({ ...previous, [id]: answer }));
    setMissing((previous) => previous.filter((item) => item !== id));
  }, []);
  async function submitAll() {
    if (batchBusy || singleBusy) return;
    const unanswered = missingPracticeAnswers(questions, drafts);
    if (unanswered.length) {
      setMissing(unanswered);
      setCurrent(unanswered[0]);
      setBatchMessage(
        `还有 ${unanswered.length} 道选择或判断题未作答，请完成标记题目后提交。`,
      );
      return;
    }
    const pending = questions.filter((q) => q.status !== "COMPLETED");
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
          if (userId) {
            try {
              sessionStorage.setItem(
                storageKey,
                JSON.stringify({
                  at: Date.now(),
                  current,
                  drafts,
                  keys: keys.current,
                }),
              );
            } catch {
              setStorageMessage(
                "提交恢复记录无法保存，请保持页面打开直至提交完成。",
              );
            }
          }
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
  const index = questions.findIndex((q) => q.id === current);
  const completed = questions.filter((q) => q.status === "COMPLETED").length;
  useEffect(() => {
    let alive = true;
    async function load() {
      const entry = cache[current];
      if (entry && entry.status !== "PENDING") {
        setBusy(false);
        setError("");
        return;
      }
      setBusy(true);
      setError("");
      const response =
        entry?.status === "PENDING" ||
        questions.find((q) => q.id === current)?.status === "PENDING"
          ? await startRecommendationRequest(current)
          : await requestApi<RecommendationDetailView>(
              recommendationDetailApiPath(current),
              { method: "GET" },
            );
      if (!alive) return;
      setBusy(false);
      if (!response.success) {
        setError(response.error);
        return;
      }
      setCache((previous) => ({ ...previous, [current]: response.data }));
      setQuestions((previous) =>
        previous.map((q) =>
          q.id === current ? { ...q, status: response.data.status } : q,
        ),
      );
    }
    void load();
    return () => {
      alive = false;
    };
  }, [current, retry, cache, questions]);
  return (
    <section className="min-w-0 space-y-5">
      <header>
        <Link
          href="/student/recommendations"
          className="text-sm text-slate-500 hover:underline"
        >
          ← 返回练习中心
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{set.courseName}</p>
            <h1 className="mt-1 text-2xl font-semibold">{set.title}</h1>
          </div>
          <p className="text-sm text-slate-600">
            已完成 {completed}/{questions.length} 题
          </p>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          可逐题提交，也可全部作答后统一提交。选择题、判断题必答；空白文字题记 0
          分，编程题异步判题。未提交答案在本标签页保存 24
          小时，关闭标签页后不保留。
        </p>
        <p role="status" className="mt-2 text-xs text-slate-600">
          {storageMessage || "草稿仅保存在当前浏览器标签页，不代表已提交。"}
        </p>
        {questions.some(
          (q) => q.type === "SHORT_ANSWER" && q.status !== "COMPLETED",
        ) && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            本组含简答题：非空答案暂不支持自主评分，请勿将其当作可自动完成的练习；空白提交为
            0 分。教师作业中的简答题仍由教师批改。
          </p>
        )}
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium">
            已提交 {completed}/{questions.length} · 待提交已填{" "}
            {
              questions.filter(
                (q) =>
                  q.status !== "COMPLETED" && practiceDraftFilled(drafts[q.id]),
              ).length
            }{" "}
            题
          </p>
          <progress
            aria-label="练习提交进度"
            max={questions.length}
            value={completed}
            className="mt-2 h-2 w-full accent-sky-600"
          />
        </div>
        <button
          type="button"
          disabled={
            !draftsReady ||
            batchBusy ||
            singleBusy ||
            busy ||
            completed === questions.length
          }
          onClick={() => void submitAll()}
          className="flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
        >
          {completed === questions.length ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {batchBusy
            ? `正在提交 ${batchProgress}/${batchTotal}…`
            : completed === questions.length
              ? "已全部提交"
              : "提交全部练习"}
        </button>
      </div>
      {batchMessage && (
        <p
          role="status"
          className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
        >
          {batchMessage}
        </p>
      )}
      {completed === questions.length && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          本组练习已全部完成，可切换题号查看答案与解析。
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <p className="mb-3 text-sm font-medium text-slate-600">
            第 {index + 1} / {questions.length} 题
          </p>
          {busy && (
            <p role="status" className="p-5 text-sm">
              正在加载题目…
            </p>
          )}
          {error && (
            <p role="alert" className="p-5 text-sm text-red-700">
              {error}{" "}
              <button
                className="underline"
                onClick={() => setRetry((value) => value + 1)}
              >
                重试
              </button>
            </p>
          )}
          {draftsReady &&
            Object.values(cache).map((item) => (
              <div
                key={`${item.id}:${item.status}:${item.programmingAttempt?.id ?? ""}`}
                hidden={item.id !== current || busy || Boolean(error)}
              >
                <fieldset disabled={batchBusy}>
                  {item.status === "STARTED" || item.status === "COMPLETED" ? (
                    <RecommendationPractice
                      embedded
                      recommendation={item}
                      initialAnswer={drafts[item.id]}
                      onDraftChange={onDraftChange}
                      onSubmissionStateChange={onSubmissionStateChange}
                      batchBusy={batchBusy}
                      onCompleted={(id) =>
                        setQuestions((previous) =>
                          previous.map((q) =>
                            q.id === id ? { ...q, status: "COMPLETED" } : q,
                          ),
                        )
                      }
                    />
                  ) : (
                    <p className="rounded-lg border bg-white p-5 text-sm text-slate-500">
                      这道练习已结束，无法继续作答。请选择本组其他题目。
                    </p>
                  )}
                </fieldset>
              </div>
            ))}
          <div className="mt-5 flex justify-between gap-3">
            <button
              disabled={busy || batchBusy || index <= 0}
              onClick={() => setCurrent(questions[index - 1].id)}
              className="rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-40"
            >
              上一题
            </button>
            <button
              disabled={busy || batchBusy || index >= questions.length - 1}
              onClick={() => setCurrent(questions[index + 1].id)}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              下一题 →
            </button>
          </div>
        </div>
        <aside className="h-fit rounded-xl border bg-white p-4 xl:sticky xl:top-24">
          <h2 className="text-sm font-semibold">题号导航</h2>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {questions.map((q, i) => (
              <button
                key={q.id}
                disabled={busy || batchBusy}
                aria-label={`第${i + 1}题，${q.status === "COMPLETED" ? "已提交" : practiceDraftFilled(drafts[q.id]) ? "已填待提交" : "未作答"}`}
                aria-current={q.id === current ? "step" : undefined}
                onClick={() => setCurrent(q.id)}
                className={`rounded-md border py-2 text-sm ${missing.includes(q.id) ? "border-red-400 ring-1 ring-red-200" : q.id === current ? "border-sky-600 ring-2 ring-sky-200" : ""} ${q.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : practiceDraftFilled(drafts[q.id]) ? "bg-sky-50 text-sky-700" : "bg-slate-50 text-slate-600"}`}
              >
                {i + 1}
                {q.status === "COMPLETED" ? " ✓" : ""}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-6 text-slate-500">
            ✓ 已提交 · 蓝色已填 · 灰色未答 · 红框必答
            <br />
            可先跳题，再回来继续作答。
          </p>
        </aside>
      </div>
    </section>
  );
}
