"use client";

import { AlertCircle, CheckCircle2, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { requestApi } from "@/components/courses/request-api";
import {
  presentKnowledgeGraphGeneration,
  type KnowledgeGraphGenerationStatus,
} from "@/components/courses/knowledge-graph-generation-state";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";
import type { ActionResult } from "@/types/action-result";

interface State {
  sourceSyllabusStructureId: string | null;
  draft: null | {
    id: string;
    status: KnowledgeGraphGenerationStatus | string;
    progress: number;
    errorCode: string | null;
    errorMessage: string | null;
    aiEnhancementStatus: string;
    aiWarningCode: string | null;
    aiWarningMessage: string | null;
    provider: string | null;
    model: string | null;
    structure: KnowledgeGraphStructure | null;
  };
  review: null | {
    id: string;
    revisionNumber: number;
    structure: KnowledgeGraphStructure;
  };
  published: {
    current: null | {
      id: string;
      versionNumber: number;
      isSourceCurrent: boolean;
      structure: KnowledgeGraphStructure;
    };
    history: Array<{
      id: string;
      versionNumber: number;
      isSourceCurrent: boolean;
    }>;
  };
}
const sourceLabel = {
  SYLLABUS: "教学大纲",
  AI_INFERRED: "AI 推断",
  TEACHER: "教师新增",
} as const;

function apiFailureMessage(
  result: Extract<ActionResult<unknown>, { success: false }>,
) {
  const code =
    result.code ?? (result.status ? `HTTP_${result.status}` : "NETWORK_ERROR");
  const recovery = result.status === 409 ? " 请刷新当前图谱状态后重试。" : "";
  return `${code}：${result.error}${recovery}`;
}

export function KnowledgeGraphWorkspace({ courseId }: { courseId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [graph, setGraph] = useState<KnowledgeGraphStructure | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const load = useCallback(
    async (preserveNotice = false) => {
      setLoading(true);
      const result = await requestApi<State>(
        `/api/teacher/courses/${courseId}/knowledge-graph`,
      );
      setLoading(false);
      if (!result.success) return setError(apiFailureMessage(result));
      setState(result.data);
      setGraph(
        structuredClone(
          result.data.review?.structure ?? result.data.draft?.structure ?? null,
        ),
      );
      setDirty(false);
      const presentation = presentKnowledgeGraphGeneration(result.data.draft);
      if (presentation.kind === "failed") {
        setNotice(null);
        setWarning(null);
        setError(presentation.message);
      } else if (presentation.kind === "warning") {
        setError(null);
        if (!preserveNotice) setNotice(null);
        setWarning(presentation.message);
      } else if (presentation.kind === "succeeded") {
        setError(null);
        setWarning(null);
        if (!preserveNotice) setNotice(presentation.message);
      } else {
        setError(null);
        if (presentation.kind === "generating") setNotice(null);
      }
    },
    [courseId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (
      state?.draft?.status !== "PENDING" &&
      state?.draft?.status !== "PROCESSING" &&
      state?.draft?.status !== "RUNNING" &&
      state?.draft?.aiEnhancementStatus !== "PROCESSING"
    )
      return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [state?.draft?.status, state?.draft?.aiEnhancementStatus, load]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const nodes = useMemo(
    () =>
      graph?.nodes.filter((node) =>
        `${node.code} ${node.name}`.toLowerCase().includes(query.toLowerCase()),
      ) ?? [],
    [graph, query],
  );
  async function generate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setWarning(null);
    setGraph(null);
    setDirty(false);
    setState((current) =>
      current ? { ...current, draft: null, review: null } : current,
    );
    const result = await requestApi<{ draft: State["draft"] }>(
      `/api/teacher/courses/${courseId}/knowledge-graph`,
      { method: "POST" },
    );
    setBusy(false);
    if (!result.success) {
      setNotice(null);
      return setError(apiFailureMessage(result));
    }
    setState((current) =>
      current
        ? {
            ...current,
            draft: result.data.draft
              ? {
                  ...result.data.draft,
                  status: "PENDING",
                  progress: 0,
                  errorCode: null,
                  errorMessage: null,
                  aiEnhancementStatus: "NOT_ATTEMPTED",
                  aiWarningCode: null,
                  aiWarningMessage: null,
                  structure: null,
                }
              : null,
            review: null,
          }
        : current,
    );
    setNotice("知识图谱生成任务已提交，请稍候。");
  }
  async function save() {
    if (!graph || !state?.draft) return;
    setBusy(true);
    const result = await requestApi<unknown>(
      `/api/teacher/courses/${courseId}/knowledge-graph/drafts/${state.draft.id}/review`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevisionNumber: state.review?.revisionNumber ?? 0,
          structure: graph,
        }),
      },
    );
    setBusy(false);
    if (!result.success)
      return setError(
        result.status === 409
          ? `${apiFailureMessage(result)} 本地修改仍保留。`
          : apiFailureMessage(result),
      );
    setNotice("知识图谱审核稿已保存。");
    await load(true);
  }
  async function publish() {
    if (
      !state?.draft ||
      !state.review ||
      !state.sourceSyllabusStructureId ||
      dirty ||
      !window.confirm("发布后将生成新的不可变知识图谱版本，确认发布吗？")
    )
      return;
    setBusy(true);
    setError(null);
    const result = await requestApi<{ versionNumber: number }>(
      `/api/teacher/courses/${courseId}/knowledge-graph/drafts/${state.draft.id}/publish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reviewRevisionId: state.review.id,
          expectedRevisionNumber: state.review.revisionNumber,
          publishedSyllabusStructureId: state.sourceSyllabusStructureId,
        }),
      },
    );
    setBusy(false);
    if (!result.success) return setError(apiFailureMessage(result));
    setNotice(`知识图谱第 ${result.data.versionNumber} 版已发布。`);
    await load(true);
  }
  async function retryAiEnhancement() {
    if (!state?.draft || state.draft.aiEnhancementStatus !== "FAILED") return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await requestApi<{ draft: State["draft"] }>(
      `/api/teacher/courses/${courseId}/knowledge-graph/drafts/${state.draft.id}/ai-enhancement`,
      { method: "POST" },
    );
    setBusy(false);
    if (!result.success) return setError(apiFailureMessage(result));
    setState((current) =>
      current?.draft
        ? {
            ...current,
            draft: {
              ...current.draft,
              aiEnhancementStatus: "PROCESSING",
              aiWarningCode: null,
              aiWarningMessage: null,
            },
          }
        : current,
    );
    setWarning("基础草稿已保留，正在重试 AI RELATED 关系推断。");
  }
  function rename(key: string, name: string) {
    setGraph((value) =>
      value
        ? {
            ...value,
            nodes: value.nodes.map((node) =>
              node.key === key ? { ...node, name } : node,
            ),
          }
        : value,
    );
    setDirty(true);
  }
  return (
    <section className="space-y-5" aria-live="polite">
      <div className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">正式大纲驱动的课程知识图谱</h2>
            <p className="mt-1 text-sm text-gray-500">
              大纲节点与先修关系确定性转换；AI 仅建议 RELATED 关系。
            </p>
          </div>
          <button
            className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={
              busy ||
              !state?.sourceSyllabusStructureId ||
              state?.draft?.status === "SUCCEEDED"
            }
            onClick={() => void generate()}
          >
            {busy ? "处理中..." : "生成基础草稿"}
          </button>
        </div>
        {!state?.sourceSyllabusStructureId && !loading ? (
          <p className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-800">
            请先审核并发布正式教学大纲结构。
          </p>
        ) : null}
        {state?.published.current &&
        !state.published.current.isSourceCurrent ? (
          <p className="mt-4 flex gap-2 rounded bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4" />
            当前正式图谱来自旧正式大纲，请重新生成、审核并发布。
          </p>
        ) : null}
        {state?.draft?.status === "PENDING" ||
        state?.draft?.status === "PROCESSING" ||
        state?.draft?.status === "RUNNING" ? (
          <p className="mt-4 flex gap-2 rounded bg-blue-50 p-3 text-sm text-blue-700">
            <RefreshCw className="h-4 w-4 animate-spin" />
            知识图谱生成中，进度 {state.draft.progress}%
          </p>
        ) : null}
      </div>
      {loading ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-gray-500">
          正在读取图谱状态...
        </p>
      ) : null}
      {graph ? (
        <div className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">图谱审核</h3>
              <p className="text-sm text-gray-500">
                {graph.nodes.length} 个节点 · {graph.edges.length} 条关系
              </p>
            </div>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2">
              <Search className="h-4 w-4" />
              <input
                className="outline-none"
                placeholder="搜索编码或名称"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 max-h-[560px] space-y-2 overflow-auto">
            {nodes.map((node) => (
              <div
                className="grid gap-2 rounded-lg border p-3 md:grid-cols-[130px_1fr_110px_auto]"
                key={node.key}
              >
                <span className="font-mono text-sm">{node.code}</span>
                <input
                  className="rounded border px-2 py-1 text-sm"
                  value={node.name}
                  onChange={(e) => rename(node.key, e.target.value)}
                />
                <span className="text-xs text-gray-600">
                  {sourceLabel[node.sourceType]}
                </span>
                <span className="text-xs">
                  {node.sourceRefs
                    .map((ref) => `第 ${ref.page} 页`)
                    .join("、") || "无大纲证据"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
              disabled={busy || (!dirty && Boolean(state?.review))}
              onClick={() => void save()}
            >
              保存审核稿
            </button>
            <button
              className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={busy || dirty || !state?.review}
              onClick={() => void publish()}
            >
              发布知识图谱
            </button>
            {state?.draft?.aiEnhancementStatus === "FAILED" ? (
              <button
                className="rounded-md border border-amber-300 px-4 py-2 text-sm text-amber-800 disabled:opacity-50"
                disabled={busy}
                onClick={() => void retryAiEnhancement()}
              >
                重试 AI 增强
              </button>
            ) : null}
            {state?.draft?.aiEnhancementStatus === "PROCESSING" ? (
              <span className="flex items-center gap-1 text-sm text-amber-700">
                <RefreshCw className="h-4 w-4 animate-spin" />
                正在重试 AI 增强
              </span>
            ) : null}
            {dirty ? (
              <span className="text-sm text-amber-700">有未保存修改</span>
            ) : null}
          </div>
        </div>
      ) : !loading &&
        state?.draft?.status !== "PENDING" &&
        state?.draft?.status !== "PROCESSING" &&
        state?.draft?.status !== "RUNNING" ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-gray-500">
          尚无知识图谱草稿。
        </p>
      ) : null}
      {state?.published.history.length ? (
        <details className="rounded-xl border bg-white p-5">
          <summary className="cursor-pointer font-medium">正式版本历史</summary>
          <ul className="mt-3 space-y-1 text-sm">
            {state.published.history.map((item) => (
              <li key={item.id}>
                正式 v{item.versionNumber} ·{" "}
                {item.isSourceCurrent ? "当前大纲" : "历史大纲"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {notice && !error ? (
        <p className="flex gap-2 rounded bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {notice}
        </p>
      ) : null}
      {warning && !error ? (
        <p className="flex gap-2 rounded bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4" />
          {warning}
        </p>
      ) : null}
      {error ? (
        <p className="flex gap-2 rounded bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      ) : null}
    </section>
  );
}
