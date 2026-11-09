"use client";

import { QuestionType } from "@prisma/client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandidateReview,
  readableFailure,
  type BatchDetail,
} from "@/components/questions/ai-question-workspace";
import { requestQuestionApi } from "@/components/questions/request-api";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";

type BatchSummary = {
  id: string;
  courseId: string;
  status: string;
  requestedCount: number;
  generatedCount: number;
  createdAt: string;
};

export function ExamAIGeneration({
  courseId,
  conceptIds,
  counts,
  graphNodes,
  objectives,
  onConfirmed,
}: {
  courseId: string;
  conceptIds: string[];
  counts: Record<QuestionType, number>;
  graphNodes: Array<{
    id: string;
    conceptId: string;
    code: string;
    name: string;
  }>;
  objectives: Array<{ code: string; title: string }>;
  onConfirmed: (question: {
    id: string;
    title: string;
    type: QuestionType;
  }) => void;
}) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [batchId, setBatchId] = useState("");
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [conceptSelections, setConceptSelections] = useState<
    Record<string, string>
  >({});
  const requestKey = useRef<string | null>(null);

  const loadBatches = useCallback(async () => {
    const result = await requestQuestionApi<BatchSummary[]>(
      "/api/teacher/ai-question-batches",
    );
    if (result.success)
      setBatches(result.data.filter((item) => item.courseId === courseId));
    else setError(result.error);
  }, [courseId]);
  async function loadBatch(id: string) {
    const result = await requestQuestionApi<BatchDetail>(
      `/api/teacher/ai-question-batches/${id}`,
    );
    if (result.success) setBatch(result.data);
    else setError(result.error);
  }
  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);
  useEffect(() => {
    if (!batchId) {
      setBatch(null);
      return;
    }
    void loadBatch(batchId);
    const timer = window.setInterval(() => void loadBatch(batchId), 3000);
    return () => window.clearInterval(timer);
  }, [batchId]);

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  async function generate() {
    if (
      !conceptIds.length ||
      total < 1 ||
      total > 20 ||
      Object.values(counts).some((count) => count > 10)
    ) {
      setError("请选择知识点，并设置 1–20 道题（每题型最多 10 道）");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set(
      "request",
      JSON.stringify({
        courseId,
        mode: "RANGE",
        chapterCode: null,
        conceptIds,
        balancedConcepts: true,
        sourceQuestionId: null,
        bloomLevel: "APPLY",
        objectiveCode: null,
        counts,
        singleChoiceOptions: 4,
        multipleChoiceOptions: 4,
        idempotencyKey: (requestKey.current ??= crypto.randomUUID()),
      }),
    );
    const result = await requestQuestionApi<{ id: string }>(
      "/api/teacher/ai-question-batches",
      {
        method: "POST",
        body: form,
      },
    );
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    requestKey.current = null;
    setBatchId(result.data.id);
    void loadBatches();
  }
  async function retry() {
    if (!batchId) return;
    setBusy(true);
    const result = await requestQuestionApi(
      `/api/teacher/ai-question-batches/${batchId}/retry`,
      { method: "POST" },
    );
    setBusy(false);
    if (!result.success) setError(result.error);
    else void loadBatch(batchId);
  }
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded bg-violet-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void generate()}
        >
          {busy ? "处理中…" : "AI 生成候选题"}
        </button>
        <span className="text-xs text-slate-600">
          需审核确认后才进入题库及本次试卷；生成不会发布考试。
        </span>
      </div>
      {batches.length ? (
        <label className="block text-sm">
          本课程最近的 AI 出题任务
          <select
            className="mt-1 block w-full rounded border p-2"
            value={batchId}
            onChange={(event) => setBatchId(event.target.value)}
          >
            <option value="">选择任务以恢复审核</option>
            {batches.map((item) => (
              <option key={item.id} value={item.id}>
                {new Date(item.createdAt).toLocaleString("zh-CN")} ·{" "}
                {item.status} · {item.generatedCount}/{item.requestedCount}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        className="text-sm text-sky-700 underline"
        onClick={() => void loadBatches()}
      >
        刷新任务列表
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {batch ? (
        <div className="space-y-3">
          <p className="text-sm">
            状态：{batch.status} · 已生成 {batch.generatedCount}/
            {batch.requestedCount} · 失败 {batch.failedCount}
          </p>
          <div className="h-2 overflow-hidden rounded bg-slate-200">
            <div
              className="h-full bg-violet-600"
              style={{ width: `${batch.job?.progress ?? 0}%` }}
            />
          </div>
          {batch.failureDetails.length ? (
            <ul className="text-sm text-amber-800">
              {batch.failureDetails.map((item) => (
                <li key={item.ordinal}>
                  第 {item.ordinal} 题 · {QUESTION_TYPE_LABELS[item.type]}：
                  {readableFailure(item.code)}
                </li>
              ))}
            </ul>
          ) : null}
          {batch.status === "FAILED" ||
          (batch.status === "PARTIAL" && batch.failedCount > 0) ? (
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm"
              disabled={busy}
              onClick={() => void retry()}
            >
              重试未完成题目
            </button>
          ) : null}
          {batch.candidates.map((candidate) => (
            <div key={`${candidate.id}:${candidate.revision}`}>
              <CandidateReview
                candidate={candidate}
                batchId={batch.id}
                graphNodes={graphNodes}
                objectives={objectives}
                onChange={() => void loadBatch(batch.id)}
                onError={setError}
                selectedConceptId={
                  conceptSelections[candidate.id] ??
                  candidate.primaryConceptId ??
                  ""
                }
                onConceptChange={(value) =>
                  setConceptSelections((old) => ({
                    ...old,
                    [candidate.id]: value,
                  }))
                }
                onEditingChange={() => undefined}
                onConfirmed={(id, title, type) =>
                  onConfirmed({ id, title, type })
                }
              />
              {candidate.status === "CONFIRMED" &&
              candidate.confirmedQuestionId ? (
                <button
                  type="button"
                  className="mt-1 text-sm text-sky-700 underline"
                  onClick={() => {
                    if (candidate.confirmedQuestionId)
                      onConfirmed({
                        id: candidate.confirmedQuestionId,
                        title: candidate.questionJson.title,
                        type: candidate.questionJson.type,
                      });
                  }}
                >
                  加入本次试卷
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
