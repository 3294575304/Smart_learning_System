"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KnowledgeGraphCanvas } from "@/components/courses/knowledge-graph-canvas";
import { KnowledgeGraphDirectory } from "@/components/courses/knowledge-graph-directory";
import { filterKnowledgeGraph } from "@/components/courses/knowledge-graph-filter";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

const NO_QUESTION_COUNTS = new Map<string, number>();

export function KnowledgeGraphPublishedView({
  graph,
  courseId,
  mastery,
}: {
  graph: KnowledgeGraphStructure;
  courseId: string;
  mastery: Array<{
    stableKey: string;
    conceptId: string;
    evidenceState: "NO_EVIDENCE" | "INSUFFICIENT_EVIDENCE" | "CONCLUSIVE";
    evidenceCount: number;
    confidence: number;
    masteryScore: number | null;
    evidenceUpdatedAt: string | null;
    practiceAvailable: boolean;
  }>;
}) {
  const [query, setQuery] = useState("");
  const [chapterKey, setChapterKey] = useState("ALL");
  const [nodeType, setNodeType] = useState<
    "ALL" | KnowledgeGraphStructure["nodes"][number]["type"]
  >("ALL");
  const [edgeType, setEdgeType] = useState<
    "ALL" | KnowledgeGraphStructure["edges"][number]["type"]
  >("ALL");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { nodes, edges } = useMemo(
    () =>
      filterKnowledgeGraph(graph, { query, nodeType, edgeType, chapterKey }),
    [graph, query, nodeType, edgeType, chapterKey],
  );
  const selectedNode = nodes.find((node) => node.key === selectedKey) ?? null;
  const masteryByStableKey = useMemo(
    () => new Map(mastery.map((item) => [item.stableKey, item])),
    [mastery],
  );
  const nodeColorByKey = useMemo(
    () =>
      new Map(
        graph.nodes
          .filter((node) => node.type === "KNOWLEDGE_POINT")
          .map((node) => {
            const item = masteryByStableKey.get(node.conceptKey);
            const color =
              item?.evidenceState !== "CONCLUSIVE" || item.masteryScore === null
                ? "#64748b"
                : item.masteryScore >= 80
                  ? "#059669"
                  : item.masteryScore >= 60
                    ? "#d97706"
                    : "#dc2626";
            return [node.key, color] as const;
          }),
      ),
    [graph.nodes, masteryByStableKey],
  );
  const selectedMastery = selectedNode
    ? masteryByStableKey.get(selectedNode.conceptKey)
    : undefined;
  function handleSelectNode(key: string) {
    if (!nodes.some((node) => node.key === key)) {
      setQuery("");
      setNodeType("ALL");
      setEdgeType("ALL");
      setChapterKey("ALL");
    }
    setSelectedKey(key);
  }
  const chapters = graph.nodes
    .filter((node) => node.type === "CHAPTER")
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
    );

  return (
    <div className="space-y-4">
      <section
        aria-label="知识图谱筛选"
        className="flex flex-wrap items-end gap-3 border-b pb-4"
      >
        <label className="min-w-48 flex-1 text-xs font-medium">
          搜索节点
          <input
            className="mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="按编码或名称搜索"
            value={query}
          />
        </label>
        <label className="text-xs font-medium">
          章节
          <select
            className="mt-1 block rounded-md border bg-white px-3 py-2 text-sm"
            onChange={(event) => setChapterKey(event.target.value)}
            value={chapterKey}
          >
            <option value="ALL">全部章节</option>
            {chapters.map((chapter) => (
              <option key={chapter.key} value={chapter.key}>
                {chapter.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          节点类型
          <select
            className="mt-1 block rounded-md border bg-white px-3 py-2 text-sm"
            onChange={(event) =>
              setNodeType(
                event.target.value as
                  "ALL" | KnowledgeGraphStructure["nodes"][number]["type"],
              )
            }
            value={nodeType}
          >
            <option value="ALL">全部节点</option>
            <option value="COURSE">课程</option>
            <option value="CHAPTER">章节</option>
            <option value="KNOWLEDGE_POINT">知识点</option>
          </select>
        </label>
        <label className="text-xs font-medium">
          关系类型
          <select
            className="mt-1 block rounded-md border bg-white px-3 py-2 text-sm"
            onChange={(event) =>
              setEdgeType(
                event.target.value as
                  "ALL" | KnowledgeGraphStructure["edges"][number]["type"],
              )
            }
            value={edgeType}
          >
            <option value="ALL">全部关系</option>
            <option value="CONTAINS">包含</option>
            <option value="PREREQUISITE">先修</option>
            <option value="RELATED">相关</option>
          </select>
        </label>
      </section>

      <section
        aria-label="个人掌握度图例"
        className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50/60 px-4 py-3 text-xs"
      >
        <span className="font-medium">我的掌握度：</span>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">
          80 分及以上
        </span>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
          60–79 分
        </span>
        <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800">
          60 分以下
        </span>
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-gray-700">
          证据不足或暂无证据
        </span>
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(15rem,0.32fr)_minmax(0,1fr)]">
        <KnowledgeGraphDirectory
          counts={NO_QUESTION_COUNTS}
          graph={graph}
          nodes={nodes}
          onSelect={handleSelectNode}
          selectedKey={selectedKey}
          showQuestionCounts={false}
        />
        <KnowledgeGraphCanvas
          edges={edges}
          nodeColorByKey={nodeColorByKey}
          nodeColorHelp="知识点球颜色表示我的掌握度；课程与章节仍按结构着色"
          nodes={nodes}
          onSelect={handleSelectNode}
          selectedKey={selectedKey}
          structure={graph}
        />
      </div>

      {selectedNode ? (
        <section
          aria-live="polite"
          className="border-t pt-4"
          aria-label="节点详情"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-base font-semibold">{selectedNode.name}</h2>
            <span className="text-muted-foreground text-xs">
              {selectedNode.code} ·
              {selectedNode.type === "COURSE"
                ? "课程"
                : selectedNode.type === "CHAPTER"
                  ? "章节"
                  : "知识点"}
            </span>
          </div>
          {selectedNode.description ? (
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              {selectedNode.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {selectedNode.isKeyTopic ? (
              <span className="rounded border px-2 py-1">重点</span>
            ) : null}
            {selectedNode.isDifficultTopic ? (
              <span className="rounded border px-2 py-1">难点</span>
            ) : null}
            {selectedNode.importance ? (
              <span className="rounded border px-2 py-1">
                重要程度：{selectedNode.importance}
              </span>
            ) : null}
          </div>
          {selectedNode.type === "KNOWLEDGE_POINT" ? (
            <div className="mt-4 rounded-lg border bg-sky-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">我的学习状态</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {selectedMastery?.evidenceState === "CONCLUSIVE"
                      ? `${selectedMastery.evidenceCount} 条正式评分证据 · 置信度 ${Math.round(selectedMastery.confidence * 100)}%`
                      : selectedMastery?.evidenceState ===
                          "INSUFFICIENT_EVIDENCE"
                        ? `已有 ${selectedMastery.evidenceCount} 条证据，暂不足以形成稳定结论`
                        : "暂无正式评分证据，完成作业或自主练习后会更新"}
                  </p>
                </div>
                <strong className="text-lg">
                  {selectedMastery?.evidenceState === "CONCLUSIVE" &&
                  selectedMastery.masteryScore !== null
                    ? `${selectedMastery.masteryScore}%`
                    : "证据不足"}
                </strong>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {selectedMastery?.practiceAvailable ? (
                  <Link
                    className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white"
                    href={`/student/recommendations?courseId=${encodeURIComponent(courseId)}&conceptId=${encodeURIComponent(selectedMastery.conceptId)}`}
                  >
                    练习这个知识点
                  </Link>
                ) : (
                  <span className="rounded-md border bg-white px-3 py-2 text-sm text-gray-500">
                    教师尚未将此知识点纳入已授进度
                  </span>
                )}
                <Link
                  className="rounded-md border bg-white px-3 py-2 text-sm font-medium"
                  href={`/student/courses/${courseId}/profile`}
                >
                  查看评分证据
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
