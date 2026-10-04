"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { QuestionType } from "@prisma/client";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import { useCallback, useEffect, useMemo, useState } from "react";

import { requestAssignmentApi } from "@/components/assignments/request-api";

interface QuestionItem {
  id: string;
  title: string;
  type: string;
  difficulty: number;
  visibility: "PRIVATE" | "PUBLIC";
  isOwn: boolean;
  hasPublic: boolean;
  isBound: boolean;
  bindingQuestionId: string;
  duplicateCount: number;
}

interface Candidate {
  id: string;
  questionId: string;
  conceptId: string;
  publishedNodeId: string;
  confidence: number;
  reason: string;
  rank: number;
  question: { id: string; title: string; content: string; type: string };
  publishedNode: { id: string; code: string; name: string };
}

interface Batch {
  id: string;
  status: string;
  provider: string | null;
  model: string | null;
  promptVersion: string;
  ruleVersion: string;
  failureCode: string | null;
  failureSummary: string | null;
  candidates: Candidate[];
  backgroundJob: {
    status: string;
    progress: number;
    attemptCount: number;
    maxAttempts: number;
    errorCode: string | null;
  } | null;
}

export function BatchMappingPanel({
  courseId,
  totalQuestions,
  questionLimit,
  catalog,
  duplicateCount,
}: {
  courseId: string;
  totalQuestions: number;
  questionLimit: number;
  catalog: QuestionItem[];
  duplicateCount: number;
}) {
  const router = useRouter();
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<
    Record<string, "PRIMARY" | "SECONDARY">
  >({});
  const [matchingMode, setMatchingMode] = useState<"BEST" | "ALL">("BEST");
  const [pending, setPending] = useState<"generate" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"ALL" | "OWN" | "PUBLIC">("ALL");
  const [showBound, setShowBound] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const scoped = catalog.filter(
    (q) =>
      (scope === "ALL" || (scope === "OWN" ? q.isOwn : q.hasPublic)) &&
      q.title.toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase()),
  );
  const visible = scoped.filter((q) => q.isBound === showBound);
  const pageQuestions = visible.slice((page - 1) * 20, page * 20);
  const batchIsActive =
    batch !== null && batch.status !== "FAILED" && batch.status !== "CONFIRMED";
  const chunkCount = Math.ceil(selectedQuestions.length / 50);
  const completedChunks = batch?.backgroundJob
    ? Math.min(
        chunkCount,
        Math.floor((batch.backgroundJob.progress / 95) * chunkCount + 0.15),
      )
    : 0;
  const completedQuestionCount = Math.min(
    selectedQuestions.length,
    completedChunks * 50,
  );
  const grouped = useMemo(() => {
    const map = new Map<string, Candidate[]>();
    for (const candidate of batch?.candidates ?? []) {
      const values = map.get(candidate.questionId) ?? [];
      values.push(candidate);
      map.set(candidate.questionId, values);
    }
    return [...map.values()];
  }, [batch]);

  const selectDefaultCandidates = useCallback(
    (value: Batch, mode = matchingMode) => {
      const defaults: Record<string, "PRIMARY" | "SECONDARY"> = {};
      for (const candidate of value.candidates) {
        if (candidate.rank === 1) defaults[candidate.id] = "PRIMARY";
        else if (mode === "ALL") defaults[candidate.id] = "SECONDARY";
      }
      setSelectedCandidates(defaults);
    },
    [matchingMode],
  );

  useEffect(() => {
    if (!batch || !["PENDING", "PROCESSING"].includes(batch.status)) return;
    const timer = window.setInterval(async () => {
      const result = await requestAssignmentApi<Batch>(
        `/api/teacher/question-mapping-batches/${batch.id}`,
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      setBatch(result.data);
      if (result.data.status === "READY") selectDefaultCandidates(result.data);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [batch, selectDefaultCandidates]);

  async function generate() {
    if (!selectedQuestions.length) {
      setError("请至少选择一道尚未人工绑定的题目");
      return;
    }
    setPending("generate");
    setError(null);
    const result = await requestAssignmentApi<Batch>(
      `/api/teacher/courses/${courseId}/question-mapping-batches`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionIds: selectedQuestions,
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
    setPending(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setBatch(result.data);
    if (result.data.status === "READY") selectDefaultCandidates(result.data);
  }

  async function confirm() {
    if (!batch) return;
    setPending("confirm");
    setError(null);
    const candidateById = new Map(
      batch.candidates.map((item) => [item.id, item]),
    );
    const selections = Object.entries(selectedCandidates).map(([id, type]) => {
      const candidate = candidateById.get(id)!;
      return {
        questionId: candidate.questionId,
        conceptId: candidate.conceptId,
        publishedNodeId: candidate.publishedNodeId,
        type,
      };
    });
    const result = await requestAssignmentApi<{
      confirmedQuestionCount: number;
      skippedExistingQuestionCount: number;
    }>(`/api/teacher/question-mapping-batches/${batch.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selections }),
    });
    setPending(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setBatch(null);
    setSelectedQuestions([]);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">一键关联绑定题目</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          选择未绑定题目后，系统会匹配当前课程正式图谱中的知识点。你可以选择每题只绑定最合适的知识点，或绑定所有匹配项；确认前仍可逐项调整主、次知识点。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm">
            题库来源
            <select
              className="ml-2 rounded-md border p-2"
              aria-label="题库来源"
              value={scope}
              disabled={pending !== null || batchIsActive}
              onChange={(event) => {
                setScope(event.target.value as typeof scope);
                setPage(1);
              }}
            >
              <option value="ALL">全部题库</option>
              <option value="OWN">我的题库</option>
              <option value="PUBLIC">公共题库</option>
            </select>
          </label>
          <input
            aria-label="搜索关联题目"
            className="rounded-md border p-2 text-sm"
            placeholder="搜索题目名称"
            value={keyword}
            disabled={pending !== null || batchIsActive}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
          />
          <div className="flex gap-2" role="group" aria-label="关联状态">
            {[false, true].map((bound) => (
              <button
                key={String(bound)}
                type="button"
                aria-pressed={showBound === bound}
                disabled={pending !== null || batchIsActive}
                className={`rounded-md border px-3 py-2 text-sm ${showBound === bound ? "border-sky-600 bg-sky-50 text-sky-800" : ""}`}
                onClick={() => {
                  setShowBound(bound);
                  setPage(1);
                }}
              >
                {bound ? "已关联" : "待关联"}{" "}
                {scoped.filter((q) => q.isBound === bound).length}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          公共题目可直接关联到本课程，无需复制。已有绑定请切换“已关联”查看或修改。已自动合并{" "}
          {duplicateCount} 道相同题目，优先展示我的题目。
        </p>
        {showBound ? (
          <div className="mt-4 space-y-2">
            {pageQuestions.map((question) => (
              <div
                key={question.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div>
                  <strong>{question.title}</strong>
                  <p className="mt-1 text-xs text-gray-500">
                    {QUESTION_TYPE_LABELS[question.type as QuestionType]} ·{" "}
                    {question.isOwn ? "我的题库" : "公共题库"}
                    {question.duplicateCount
                      ? ` · 合并 ${question.duplicateCount} 道副本`
                      : ""}
                  </p>
                </div>
                <Link
                  className="shrink-0 rounded-md border px-3 py-2 text-sky-700"
                  href={`/teacher/questions/${question.bindingQuestionId}?courseId=${courseId}`}
                >
                  查看与修改关联
                </Link>
              </div>
            ))}
            {!visible.length ? (
              <p className="text-sm text-gray-500">此范围暂无已关联题目。</p>
            ) : null}
          </div>
        ) : (
          <>
            <fieldset className="mt-4 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
              <legend className="px-1 text-sm font-medium">
                每道题如何选择知识点
              </legend>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-md bg-white p-3 text-sm">
                  <input
                    checked={matchingMode === "BEST"}
                    name="matchingMode"
                    onChange={() => {
                      setMatchingMode("BEST");
                      if (batch?.status === "READY")
                        selectDefaultCandidates(batch, "BEST");
                    }}
                    type="radio"
                  />
                  <span>
                    <strong>仅关联最合适的</strong>
                    <span className="mt-1 block text-xs text-gray-600">
                      每题默认选择置信度最高的一个知识点，作为主知识点。
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md bg-white p-3 text-sm">
                  <input
                    checked={matchingMode === "ALL"}
                    name="matchingMode"
                    onChange={() => {
                      setMatchingMode("ALL");
                      if (batch?.status === "READY")
                        selectDefaultCandidates(batch, "ALL");
                    }}
                    type="radio"
                  />
                  <span>
                    <strong>关联全部匹配候选</strong>
                    <span className="mt-1 block text-xs text-gray-600">
                      每题默认选中 AI 返回的候选（最多 3
                      个）；最高匹配为主知识点，其余为次知识点。
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
            {totalQuestions > questionLimit ? (
              <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                该课程共有 {totalQuestions} 道未绑定题目；本次最多处理{" "}
                {questionLimit} 道，请先处理本批，再生成下一批。
              </p>
            ) : null}
            {visible.length ? (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                  <span aria-live="polite">
                    已选择 {selectedQuestions.length} 道 · 当前范围{" "}
                    {visible.length} 道
                  </span>
                  <button
                    className="underline"
                    disabled={pending !== null || batchIsActive}
                    onClick={() =>
                      setSelectedQuestions(
                        visible.slice(0, questionLimit).map((item) => item.id),
                      )
                    }
                    type="button"
                  >
                    选择当前范围待关联题目
                  </button>
                  <button
                    className="underline"
                    disabled={
                      pending !== null ||
                      batchIsActive ||
                      !selectedQuestions.length
                    }
                    onClick={() => setSelectedQuestions([])}
                    type="button"
                  >
                    清除选择
                  </button>
                </div>
                <div className="max-h-80 space-y-2 overflow-auto">
                  {pageQuestions.map((question) => (
                    <label
                      className="flex items-start gap-3 rounded-md border p-3"
                      key={question.id}
                    >
                      <input
                        checked={selectedQuestions.includes(question.id)}
                        onChange={(event) =>
                          setSelectedQuestions((current) =>
                            event.target.checked
                              ? current.length >= questionLimit
                                ? current
                                : [...current, question.id]
                              : current.filter((id) => id !== question.id),
                          )
                        }
                        aria-label={`选择${question.title}`}
                        disabled={
                          pending !== null ||
                          batchIsActive ||
                          (!selectedQuestions.includes(question.id) &&
                            selectedQuestions.length >= questionLimit)
                        }
                        type="checkbox"
                      />
                      <span className="text-sm">
                        <strong>{question.title}</strong> ·{" "}
                        {QUESTION_TYPE_LABELS[question.type as QuestionType]} ·
                        难度 {question.difficulty} ·{" "}
                        {question.isOwn ? "我的题库" : "公共题库"}
                        {question.duplicateCount
                          ? ` · 合并 ${question.duplicateCount} 道副本`
                          : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground mt-4 text-sm">
                此范围暂无待关联题目，请切换“已关联”查看已有绑定，或调整来源和搜索条件。
              </p>
            )}
            <button
              className="mt-4 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={
                pending !== null || batchIsActive || !selectedQuestions.length
              }
              onClick={() => void generate()}
              type="button"
            >
              {pending === "generate"
                ? "正在生成…"
                : `生成全章节 AI 候选（${selectedQuestions.length} 道）`}
            </button>
          </>
        )}
        {visible.length > 20 ? (
          <nav
            aria-label="关联题目分页"
            className="mt-4 flex items-center gap-3 text-sm"
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </button>
            <span>
              第 {page} / {Math.ceil(visible.length / 20)} 页
            </span>
            <button
              type="button"
              disabled={page * 20 >= visible.length}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </nav>
        ) : null}
      </section>

      {batch ? (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">2. 核对匹配结果并确认绑定</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Provider {batch.provider ?? "—"} · Model {batch.model ?? "—"} ·
            Prompt {batch.promptVersion} · Rule {batch.ruleVersion}
          </p>
          {["PENDING", "PROCESSING"].includes(batch.status) ? (
            <div className="mt-3 space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <p>
                候选已进入持久化后台队列，离开页面不会中断任务。
                {batch.backgroundJob
                  ? `（第 ${batch.backgroundJob.attemptCount}/${batch.backgroundJob.maxAttempts} 次尝试）`
                  : null}
              </p>
              <div
                aria-label="题目知识点候选生成进度"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={batch.backgroundJob?.progress ?? 0}
                className="h-2 overflow-hidden rounded-full bg-blue-100"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-blue-600 transition-[width] duration-500"
                  style={{
                    width: `${batch.backgroundJob?.progress ?? 0}%`,
                  }}
                />
              </div>
              <p aria-live="polite">
                {completedChunks === chunkCount && chunkCount > 0
                  ? "AI 分批匹配已完成，正在保存候选…"
                  : `已完成 ${completedChunks}/${chunkCount} 批，约 ${completedQuestionCount}/${selectedQuestions.length} 道；正在处理第 ${Math.min(completedChunks + 1, chunkCount)}/${chunkCount} 批。`}
                {` ${batch.backgroundJob?.progress ?? 0}%`}
              </p>
            </div>
          ) : batch.status === "FAILED" ? (
            <div className="mt-3 space-y-3">
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {batch.failureSummary ?? "候选生成失败，请重新发起。"}
              </p>
              <button
                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                disabled={pending !== null}
                onClick={() => setBatch(null)}
                type="button"
              >
                关闭失败批次并重新生成
              </button>
            </div>
          ) : batch.failureSummary ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {batch.failureSummary}（{batch.failureCode}）
            </p>
          ) : (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              外部 AI 候选已通过严格结构和 ID 范围校验；仍须由教师确认。
            </p>
          )}
          <div className="mt-5 space-y-5">
            {grouped.map((candidates) => (
              <article
                className="rounded-lg border p-4"
                key={candidates[0]!.questionId}
              >
                <h3 className="font-medium">{candidates[0]!.question.title}</h3>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                  {candidates[0]!.question.content}
                </p>
                <div className="mt-3 space-y-2">
                  {candidates.map((candidate) => {
                    const selected = selectedCandidates[candidate.id];
                    return (
                      <div
                        className="flex flex-wrap items-center gap-3 rounded bg-sky-50/60 p-3 text-sm"
                        key={candidate.id}
                      >
                        <input
                          checked={Boolean(selected)}
                          onChange={(event) =>
                            setSelectedCandidates((current) => {
                              const next = { ...current };
                              if (event.target.checked)
                                next[candidate.id] = "SECONDARY";
                              else delete next[candidate.id];
                              return next;
                            })
                          }
                          type="checkbox"
                        />
                        <span className="min-w-48 font-medium">
                          {candidate.publishedNode.code} ·{" "}
                          {candidate.publishedNode.name}
                        </span>
                        <span className="text-muted-foreground">
                          置信度 {Math.round(candidate.confidence * 100)}% ·{" "}
                          {candidate.reason}
                        </span>
                        {selected ? (
                          <select
                            className="ml-auto rounded border bg-white px-2 py-1"
                            onChange={(event) =>
                              setSelectedCandidates((current) => ({
                                ...current,
                                [candidate.id]: event.target.value as
                                  "PRIMARY" | "SECONDARY",
                              }))
                            }
                            value={selected}
                          >
                            <option value="PRIMARY">主 Concept</option>
                            <option value="SECONDARY">次 Concept</option>
                          </select>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
          <button
            className="mt-5 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={
              pending !== null ||
              batch.status !== "READY" ||
              Object.keys(selectedCandidates).length === 0
            }
            onClick={() => void confirm()}
            type="button"
          >
            {pending === "confirm"
              ? "正在确认…"
              : `确认绑定所选知识点（${Object.keys(selectedCandidates).length} 项）`}
          </button>
        </section>
      ) : null}
      {error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
