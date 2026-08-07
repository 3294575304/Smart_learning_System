"use client";

import {
  AlertCircle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KnowledgeGraphCanvas } from "@/components/courses/knowledge-graph-canvas";
import { requestApi } from "@/components/courses/request-api";
import {
  presentKnowledgeGraphGeneration,
  type KnowledgeGraphGenerationStatus,
} from "@/components/courses/knowledge-graph-generation-state";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";
import type { ActionResult } from "@/types/action-result";

interface State {
  sourceSyllabusStructureId: string | null;
  latestReviewRevisionNumber: number;
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
const nodeTypeLabel = {
  COURSE: "课程",
  CHAPTER: "章节",
  KNOWLEDGE_POINT: "知识点",
} as const;
const edgeTypeLabel = {
  CONTAINS: "包含",
  PREREQUISITE: "先修",
  RELATED: "相关",
} as const;

function changeCount(
  before: KnowledgeGraphStructure,
  after: KnowledgeGraphStructure,
) {
  const compare = <T,>(
    left: T[],
    right: T[],
    identity: (value: T) => string,
  ) => {
    const previous = new Map(left.map((value) => [identity(value), value]));
    const next = new Map(right.map((value) => [identity(value), value]));
    return {
      added: [...next.keys()].filter((key) => !previous.has(key)).length,
      removed: [...previous.keys()].filter((key) => !next.has(key)).length,
      modified: [...next].filter(
        ([key, value]) =>
          previous.has(key) &&
          JSON.stringify(previous.get(key)) !== JSON.stringify(value),
      ).length,
    };
  };
  return {
    nodes: compare(before.nodes, after.nodes, (node) => node.conceptKey),
    edges: compare(
      before.edges,
      after.edges,
      (edge) => edge.type + ":" + edge.from + ":" + edge.to,
    ),
  };
}

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
  const [nodeType, setNodeType] = useState<"ALL" | keyof typeof nodeTypeLabel>(
    "ALL",
  );
  const [edgeType, setEdgeType] = useState<"ALL" | keyof typeof edgeTypeLabel>(
    "ALL",
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newEdge, setNewEdge] = useState<{
    type: "PREREQUISITE" | "RELATED";
    from: string;
    to: string;
  }>({ type: "RELATED", from: "", to: "" });
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
      setSelectedKey(null);
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
      graph?.nodes.filter(
        (node) =>
          (nodeType === "ALL" || node.type === nodeType) &&
          (node.code + " " + node.name)
            .toLowerCase()
            .includes(query.toLowerCase()),
      ) ?? [],
    [graph, nodeType, query],
  );
  const edges = useMemo(
    () =>
      graph?.edges.filter(
        (edge) => edgeType === "ALL" || edge.type === edgeType,
      ) ?? [],
    [edgeType, graph],
  );
  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.key === selectedKey) ?? null,
    [graph, selectedKey],
  );
  const pendingDiff = useMemo(
    () =>
      graph && state?.published.current
        ? changeCount(state.published.current.structure, graph)
        : null,
    [graph, state?.published],
  );
  async function generate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setWarning(null);
    setGraph(null);
    setDirty(false);
    setState((current) =>
      current
        ? {
            ...current,
            draft: null,
            review: null,
            latestReviewRevisionNumber: 0,
          }
        : current,
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
          expectedRevisionNumber: state.latestReviewRevisionNumber,
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
  function updateSelectedNode(
    mutator: (
      node: KnowledgeGraphStructure["nodes"][number],
    ) => KnowledgeGraphStructure["nodes"][number],
  ) {
    if (!selectedKey) return;
    setGraph((value) =>
      value
        ? {
            ...value,
            nodes: value.nodes.map((node) =>
              node.key === selectedKey ? mutator(node) : node,
            ),
          }
        : value,
    );
    setDirty(true);
    setNotice(null);
  }
  function updateEdgeDescription(key: string, description: string) {
    setGraph((value) =>
      value
        ? {
            ...value,
            edges: value.edges.map((edge) =>
              edge.key === key
                ? {
                    ...edge,
                    description: description || null,
                    sourceType: "TEACHER",
                    sourceRefs: [],
                    confidence: null,
                  }
                : edge,
            ),
          }
        : value,
    );
    setDirty(true);
    setNotice(null);
  }
  function addRelationship() {
    if (!graph || !newEdge.from || !newEdge.to) {
      setError("请选择关系的起点和终点。");
      return;
    }
    if (newEdge.from === newEdge.to) {
      setError("关系不能连接同一个知识点。");
      return;
    }
    const pair =
      newEdge.type === "RELATED"
        ? [newEdge.from, newEdge.to].sort().join("|")
        : newEdge.from + "|" + newEdge.to;
    const duplicate = graph.edges.some((edge) => {
      const existingPair =
        edge.type === "RELATED"
          ? [edge.from, edge.to].sort().join("|")
          : edge.from + "|" + edge.to;
      return edge.type === newEdge.type && existingPair === pair;
    });
    if (duplicate) {
      setError("相同关系已经存在。");
      return;
    }
    setGraph({
      ...graph,
      edges: [
        ...graph.edges,
        {
          key: "teacher:" + crypto.randomUUID(),
          type: newEdge.type,
          from: newEdge.from,
          to: newEdge.to,
          description: null,
          sourceType: "TEACHER",
          sourceRefs: [],
          confidence: null,
        },
      ],
    });
    setDirty(true);
    setError(null);
    setNotice(null);
  }
  function removeEdge(key: string) {
    if (!window.confirm("确认从当前审核稿中移除这条关系吗？")) return;
    setGraph((value) =>
      value
        ? { ...value, edges: value.edges.filter((edge) => edge.key !== key) }
        : value,
    );
    setDirty(true);
    setNotice(null);
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
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Search className="h-4 w-4" />
                <input
                  className="outline-none"
                  placeholder="搜索编码或名称"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select
                aria-label="筛选节点类型"
                className="rounded-md border px-3 py-2 text-sm"
                value={nodeType}
                onChange={(event) =>
                  setNodeType(
                    event.target.value as "ALL" | keyof typeof nodeTypeLabel,
                  )
                }
              >
                <option value="ALL">全部节点</option>
                {Object.entries(nodeTypeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="筛选关系类型"
                className="rounded-md border px-3 py-2 text-sm"
                value={edgeType}
                onChange={(event) =>
                  setEdgeType(
                    event.target.value as "ALL" | keyof typeof edgeTypeLabel,
                  )
                }
              >
                <option value="ALL">全部关系</option>
                {Object.entries(edgeTypeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <KnowledgeGraphCanvas
              edges={edges}
              nodes={nodes}
              onSelect={setSelectedKey}
              selectedKey={selectedKey}
            />
            <aside className="rounded-lg border p-4">
              <h4 className="font-medium">节点详情与审核</h4>
              {selectedNode ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-xs text-gray-500">节点编码</span>
                      <input
                        className="w-full rounded border bg-slate-50 px-2 py-1.5"
                        readOnly
                        value={selectedNode.code}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-gray-500">节点类型</span>
                      <input
                        className="w-full rounded border bg-slate-50 px-2 py-1.5"
                        readOnly
                        value={nodeTypeLabel[selectedNode.type]}
                      />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">名称</span>
                    <input
                      className="w-full rounded border px-2 py-1.5"
                      value={selectedNode.name}
                      onChange={(event) =>
                        updateSelectedNode((node) => ({
                          ...node,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">说明</span>
                    <textarea
                      className="min-h-24 w-full rounded border px-2 py-1.5"
                      value={selectedNode.description ?? ""}
                      onChange={(event) =>
                        updateSelectedNode((node) => ({
                          ...node,
                          description: event.target.value || null,
                        }))
                      }
                    />
                  </label>
                  {selectedNode.type === "KNOWLEDGE_POINT" ? (
                    <>
                      <label className="block space-y-1">
                        <span className="text-xs text-gray-500">重要程度</span>
                        <select
                          className="w-full rounded border px-2 py-1.5"
                          value={selectedNode.importance ?? "NORMAL"}
                          onChange={(event) =>
                            updateSelectedNode((node) => ({
                              ...node,
                              importance: event.target.value as
                                "CORE" | "NORMAL" | "EXTENDED",
                            }))
                          }
                        >
                          <option value="CORE">核心</option>
                          <option value="NORMAL">普通</option>
                          <option value="EXTENDED">拓展</option>
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            checked={selectedNode.isKeyTopic}
                            onChange={(event) =>
                              updateSelectedNode((node) => ({
                                ...node,
                                isKeyTopic: event.target.checked,
                              }))
                            }
                            type="checkbox"
                          />
                          重点
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            checked={selectedNode.isDifficultTopic}
                            onChange={(event) =>
                              updateSelectedNode((node) => ({
                                ...node,
                                isDifficultTopic: event.target.checked,
                              }))
                            }
                            type="checkbox"
                          />
                          难点
                        </label>
                      </div>
                    </>
                  ) : null}
                  <div className="rounded bg-slate-50 p-3 text-xs text-gray-600">
                    <p>来源：{sourceLabel[selectedNode.sourceType]}</p>
                    <p className="mt-1">
                      原文：
                      {selectedNode.sourceRefs
                        .map((ref) => "第 " + ref.page + " 页")
                        .join("、") || "无大纲证据"}
                    </p>
                    <p className="mt-1">
                      目标映射：
                      {selectedNode.objectiveMappings.join("、") || "无"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  点击图中的节点查看来源并修改审核属性。
                </p>
              )}
            </aside>
          </div>
          <details className="mt-4 rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">
              关系审核与编辑（{graph.edges.length}）
            </summary>
            <div className="mt-4 grid gap-2 md:grid-cols-[130px_1fr_1fr_auto]">
              <select
                aria-label="新增关系类型"
                className="rounded border px-2 py-2 text-sm"
                value={newEdge.type}
                onChange={(event) =>
                  setNewEdge((value) => ({
                    ...value,
                    type: event.target.value as "PREREQUISITE" | "RELATED",
                  }))
                }
              >
                <option value="PREREQUISITE">先修</option>
                <option value="RELATED">相关</option>
              </select>
              <select
                aria-label="新增关系起点"
                className="rounded border px-2 py-2 text-sm"
                value={newEdge.from}
                onChange={(event) =>
                  setNewEdge((value) => ({
                    ...value,
                    from: event.target.value,
                  }))
                }
              >
                <option value="">选择起点知识点</option>
                {graph.nodes
                  .filter((node) => node.type === "KNOWLEDGE_POINT")
                  .map((node) => (
                    <option key={node.key} value={node.key}>
                      {node.code} · {node.name}
                    </option>
                  ))}
              </select>
              <select
                aria-label="新增关系终点"
                className="rounded border px-2 py-2 text-sm"
                value={newEdge.to}
                onChange={(event) =>
                  setNewEdge((value) => ({
                    ...value,
                    to: event.target.value,
                  }))
                }
              >
                <option value="">选择终点知识点</option>
                {graph.nodes
                  .filter((node) => node.type === "KNOWLEDGE_POINT")
                  .map((node) => (
                    <option key={node.key} value={node.key}>
                      {node.code} · {node.name}
                    </option>
                  ))}
              </select>
              <button
                className="flex items-center justify-center gap-1 rounded border px-3 py-2 text-sm"
                onClick={addRelationship}
                type="button"
              >
                <Plus className="h-4 w-4" />
                添加关系
              </button>
            </div>
            <div className="mt-4 max-h-80 space-y-2 overflow-auto">
              {graph.edges
                .filter((edge) => edgeType === "ALL" || edge.type === edgeType)
                .map((edge) => (
                  <div
                    className="grid items-center gap-2 rounded bg-slate-50 p-3 text-sm md:grid-cols-[90px_1fr_1fr_1fr_auto]"
                    key={edge.key}
                  >
                    <span>{edgeTypeLabel[edge.type]}</span>
                    <span className="truncate">
                      {graph.nodes.find((node) => node.key === edge.from)
                        ?.name ?? edge.from}
                    </span>
                    <span className="truncate">
                      {graph.nodes.find((node) => node.key === edge.to)?.name ??
                        edge.to}
                    </span>
                    <input
                      aria-label="关系说明"
                      className="rounded border bg-white px-2 py-1"
                      placeholder="补充关系说明"
                      value={edge.description ?? ""}
                      onChange={(event) =>
                        updateEdgeDescription(edge.key, event.target.value)
                      }
                    />
                    <button
                      aria-label="移除关系"
                      className="rounded border p-1.5 text-red-600 disabled:opacity-30"
                      disabled={edge.type === "CONTAINS"}
                      onClick={() => removeEdge(edge.key)}
                      title={
                        edge.type === "CONTAINS"
                          ? "包含关系用于维持图谱层级，不能直接移除"
                          : "移除关系"
                      }
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
            </div>
          </details>
          {pendingDiff ? (
            <div className="mt-4 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-medium">发布前版本差异预览</p>
              <p className="mt-1">
                节点：新增 {pendingDiff.nodes.added}、移除{" "}
                {pendingDiff.nodes.removed}、修改 {pendingDiff.nodes.modified}；
                关系：新增 {pendingDiff.edges.added}、移除{" "}
                {pendingDiff.edges.removed}、修改 {pendingDiff.edges.modified}。
              </p>
            </div>
          ) : null}
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
