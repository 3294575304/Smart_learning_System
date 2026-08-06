"use client";

import { QuestionGraphBindingType } from "@prisma/client";
import { useEffect, useState } from "react";
import { requestQuestionApi } from "@/components/questions/request-api";

type Course = {
  id: string;
  name: string;
  courseNo: string;
  term: string;
  currentPublishedKnowledgeGraphVersionId: string | null;
};
type Node = {
  id: string;
  conceptId: string;
  name: string;
  code: string;
  nodeType: string;
  importance: string | null;
  isKeyTopic: boolean;
  isDifficultTopic: boolean;
  sourceRefs: unknown;
  sourcePath: string | null;
  parent: { id: string; name: string } | null;
};
type BindingState = {
  revision: number;
  sourceVersionNumber: number | null;
  currentVersionId: string | null;
  needsReview: boolean;
  bindings: Array<{
    conceptId: string;
    type: QuestionGraphBindingType;
    sourceNodeId: string;
    sourceNode: Node;
    currentNode: { id: string; name: string; code: string } | null;
    status:
      | "CURRENT"
      | "RESOLVED_TO_CURRENT_VERSION"
      | "MISSING_FROM_CURRENT_VERSION";
  }>;
};

function sourceSummary(value: unknown): string {
  if (!Array.isArray(value)) return "正式来源证据";
  const refs = value
    .filter((item): item is { page?: unknown; quote?: unknown } =>
      Boolean(item && typeof item === "object"),
    )
    .slice(0, 2)
    .map((item) => {
      const page =
        typeof item.page === "number" ? `第 ${item.page} 页` : "来源";
      const quote =
        typeof item.quote === "string" ? `：${item.quote.slice(0, 80)}` : "";
      return `${page}${quote}`;
    });
  return refs.join("；") || "正式来源证据";
}

export function QuestionGraphBindingPanel({
  questionId,
  courses,
}: {
  questionId: string;
  courses: Course[];
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [keyword, setKeyword] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [graphVersionId, setGraphVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [binding, setBinding] = useState<BindingState | null>(null);
  const [selected, setSelected] = useState<
    Array<{
      conceptId: string;
      publishedNodeId: string;
      type: QuestionGraphBindingType;
    }>
  >([]);
  const [status, setStatus] = useState<"idle" | "loading" | "saving">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!courseId) return;
    setStatus("loading");
    setMessage(null);
    const [nodeResult, bindingResult] = await Promise.all([
      requestQuestionApi<{
        graphVersionId: string;
        versionNumber: number;
        nodes: Node[];
      }>(
        `/api/teacher/courses/${courseId}/knowledge-graph/bindable-nodes?keyword=${encodeURIComponent(keyword)}`,
      ),
      requestQuestionApi<BindingState>(
        `/api/teacher/questions/${questionId}/knowledge-graph-bindings?courseId=${courseId}`,
      ),
    ]);
    if (!nodeResult.success) {
      setNodes([]);
      setGraphVersionId(null);
      setMessage(nodeResult.error);
    } else {
      setNodes(nodeResult.data.nodes);
      setGraphVersionId(nodeResult.data.graphVersionId);
      setVersionNumber(nodeResult.data.versionNumber);
    }
    if (bindingResult.success) {
      setBinding(bindingResult.data);
      setSelected(
        bindingResult.data.bindings
          .filter((item) => item.currentNode)
          .map((item) => ({
            conceptId: item.conceptId,
            publishedNodeId: item.currentNode?.id ?? item.sourceNodeId,
            type: item.type,
          })),
      );
    } else setMessage((current) => current ?? bindingResult.error);
    setStatus("idle");
  }
  useEffect(() => {
    void load();
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  function select(
    node: Node,
    type: QuestionGraphBindingType,
    checked: boolean,
  ) {
    setSelected((current) => {
      const without = current.filter(
        (item) =>
          item.conceptId !== node.conceptId &&
          (type !== QuestionGraphBindingType.PRIMARY ||
            item.type !== QuestionGraphBindingType.PRIMARY),
      );
      return checked
        ? [
            ...without,
            { conceptId: node.conceptId, publishedNodeId: node.id, type },
          ]
        : current.filter(
            (item) =>
              !(item.conceptId === node.conceptId && item.type === type),
          );
    });
  }
  async function save() {
    if (!graphVersionId) return;
    setStatus("saving");
    setMessage(null);
    const result = await requestQuestionApi<BindingState>(
      `/api/teacher/questions/${questionId}/knowledge-graph-bindings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          graphVersionId,
          expectedRevision: binding?.revision ?? 0,
          bindings: selected,
        }),
      },
    );
    if (result.success) {
      setBinding(result.data);
      setMessage("课程知识图谱绑定已保存。");
    } else setMessage(result.error);
    setStatus("idle");
  }
  async function clear() {
    if (
      !confirm(
        "确认清空该课程下的全部图谱绑定？此操作不会删除知识图谱或旧知识点。",
      )
    )
      return;
    setStatus("saving");
    const result = await requestQuestionApi<{
      cleared: boolean;
      revision: number;
    }>(`/api/teacher/questions/${questionId}/knowledge-graph-bindings`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId,
        expectedRevision: binding?.revision ?? 0,
      }),
    });
    if (result.success) {
      setBinding({
        revision: 0,
        sourceVersionNumber: null,
        currentVersionId: graphVersionId,
        needsReview: false,
        bindings: [],
      });
      setSelected([]);
      setMessage("绑定已清空。");
    } else setMessage(result.error);
    setStatus("idle");
  }
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="font-medium">课程知识图谱绑定</h2>
        <p className="text-muted-foreground text-sm">
          绑定仅在所选课程中生效，不替代原有知识点。
        </p>
      </div>
      {courses.length === 0 ? (
        <p className="text-sm">暂无可管理课程。</p>
      ) : (
        <>
          <label className="block text-sm">
            课程
            <select
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name} · {course.courseNo} · {course.term}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border px-3 py-2"
              placeholder="搜索节点名称或编码"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <button
              className="rounded-md border px-3"
              type="button"
              onClick={() => void load()}
            >
              搜索
            </button>
          </div>
          {status === "loading" ? (
            <p className="text-sm">正在加载正式图谱…</p>
          ) : null}
          {graphVersionId ? (
            <p className="text-sm">
              当前正式版本：v{versionNumber}；绑定来源版本：
              {binding?.sourceVersionNumber
                ? `v${binding.sourceVersionNumber}`
                : "尚未绑定"}
            </p>
          ) : null}
          {binding?.needsReview ? (
            <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
              来源版本已过期，部分 Concept 在当前版本缺失，需要重新审核。
            </p>
          ) : null}
          {binding?.bindings.some(
            (item) => item.status === "RESOLVED_TO_CURRENT_VERSION",
          ) ? (
            <p className="rounded bg-blue-50 p-2 text-sm text-blue-800">
              部分绑定已通过稳定 Concept 解析到当前正式版本，请确认后保存。
            </p>
          ) : null}
          {graphVersionId && nodes.length === 0 && status !== "loading" ? (
            <p className="text-sm">没有匹配的正式节点。</p>
          ) : null}
          <div className="max-h-80 space-y-2 overflow-auto">
            {nodes.map((node) => {
              const chosen = selected.find(
                (item) => item.conceptId === node.conceptId,
              );
              return (
                <div className="rounded border p-3 text-sm" key={node.id}>
                  <div className="font-medium">
                    {node.name}{" "}
                    <span className="text-muted-foreground">
                      {node.code} · {node.nodeType}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {node.parent ? `上级：${node.parent.name}；` : ""}
                    {node.isKeyTopic ? "重点；" : ""}
                    {node.isDifficultTopic ? "难点；" : ""}
                    来源：{node.sourcePath ?? sourceSummary(node.sourceRefs)}
                  </div>
                  <div className="mt-2 flex gap-4">
                    <label>
                      <input
                        type="radio"
                        name="primary-graph-node"
                        checked={
                          chosen?.type === QuestionGraphBindingType.PRIMARY
                        }
                        onChange={() =>
                          select(node, QuestionGraphBindingType.PRIMARY, true)
                        }
                      />{" "}
                      主知识点
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={
                          chosen?.type === QuestionGraphBindingType.SECONDARY
                        }
                        onChange={(event) =>
                          select(
                            node,
                            QuestionGraphBindingType.SECONDARY,
                            event.target.checked,
                          )
                        }
                      />{" "}
                      次要知识点
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          {message ? (
            <p className="rounded bg-gray-50 p-2 text-sm">{message}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
              disabled={!graphVersionId || status === "saving"}
              type="button"
              onClick={() => void save()}
            >
              {status === "saving" ? "保存中…" : "保存绑定"}
            </button>
            <button
              className="rounded border px-4 py-2"
              disabled={!binding?.bindings.length || status === "saving"}
              type="button"
              onClick={() => void clear()}
            >
              清空绑定
            </button>
          </div>
        </>
      )}
    </section>
  );
}
