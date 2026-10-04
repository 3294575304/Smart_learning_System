"use client";

import { useMemo } from "react";
import { graphChapterMembership } from "@/components/courses/knowledge-graph-filter";
import { graphChapterColors } from "@/components/courses/knowledge-graph-presentation";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

type Node = KnowledgeGraphStructure["nodes"][number];
export function KnowledgeGraphDirectory({
  graph,
  nodes,
  selectedKey,
  counts,
  showQuestionCounts = true,
  onSelect,
}: {
  graph: KnowledgeGraphStructure;
  nodes: Node[];
  selectedKey: string | null;
  counts: Map<string, number>;
  showQuestionCounts?: boolean;
  onSelect: (key: string) => void;
}) {
  const courseNode = graph.nodes.find((node) => node.type === "COURSE");
  const groups = useMemo(() => {
    const membership = graphChapterMembership(graph);
    const colors = graphChapterColors(graph);
    const sorted = [...nodes].sort(
      (a, b) =>
        (a.type === "CHAPTER" ? 0 : 1) - (b.type === "CHAPTER" ? 0 : 1) ||
        a.sortOrder - b.sortOrder ||
        a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
    );
    const chapters = graph.nodes
      .filter((node) => node.type === "CHAPTER")
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
      );
    return [
      ...chapters.map((chapter) => ({
        key: chapter.key,
        title: chapter.name,
        color: colors.get(chapter.key) ?? "#334155",
        nodes: sorted.filter(
          (node) =>
            node.type !== "COURSE" &&
            membership.get(node.key) === chapter.key &&
            node.key !== chapter.key,
        ),
      })),
      {
        key: "ungrouped",
        title: "未归属节点",
        color: "#334155",
        nodes: sorted.filter(
          (node) => node.type !== "COURSE" && !membership.has(node.key),
        ),
      },
    ].filter((group) => group.nodes.length || group.key !== "ungrouped");
  }, [graph, nodes]);
  return (
    <nav
      aria-label="按章节查找知识点"
      className="min-w-0 rounded-lg border bg-sky-50/60 p-3"
    >
      <h4 className="font-medium">节点目录</h4>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        点击中文名称定位，查看知识点与关联题目。
      </p>
      <div className="mt-3 max-h-72 overflow-y-auto lg:max-h-[700px]">
        <div
          className="rounded border border-l-4 bg-white p-2"
          style={{ borderLeftColor: "#334155" }}
        >
          {courseNode ? (
            <button
              type="button"
              aria-pressed={selectedKey === courseNode.key}
              className={`w-full rounded px-2 py-2 text-left text-xs leading-5 ${selectedKey === courseNode.key ? "bg-sky-100/70 font-semibold" : "hover:bg-sky-50/60"}`}
              onClick={() => onSelect(courseNode.key)}
              title={`${courseNode.name} · ${courseNode.code}`}
            >
              <span className="block break-words">{courseNode.name}</span>
              <span className="mt-1 block text-[11px] text-gray-500">
                课程 · 包含{" "}
                {graph.nodes.filter((node) => node.type === "CHAPTER").length}{" "}
                个章节
              </span>
            </button>
          ) : null}
          {groups.length ? (
            <div className="mt-2 space-y-2 border-l-2 border-sky-100 pl-2">
              {groups.map((group) => (
                <details
                  key={group.key}
                  open
                  className="rounded border border-l-4 bg-white p-2"
                  style={{ borderLeftColor: group.color }}
                >
                  <summary
                    className="cursor-pointer rounded px-1 py-1.5 text-xs leading-5 font-semibold"
                    style={{
                      color: group.color,
                      backgroundColor: `${group.color}12`,
                    }}
                    onClick={() => {
                      if (group.key !== "ungrouped") onSelect(group.key);
                    }}
                  >
                    {group.title}
                    <span className="ml-1 text-gray-400">
                      ({group.nodes.length})
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {group.nodes.map((node) => (
                      <li key={node.key}>
                        <button
                          type="button"
                          aria-pressed={selectedKey === node.key}
                          title={`${node.name} · ${node.code}`}
                          className={`w-full rounded border p-2 text-left text-xs leading-5 transition-colors ${selectedKey === node.key ? "font-medium" : "border-transparent hover:bg-sky-100/70"}`}
                          style={
                            selectedKey === node.key
                              ? {
                                  borderColor: group.color,
                                  backgroundColor: `${group.color}12`,
                                  color: group.color,
                                }
                              : undefined
                          }
                          onClick={() => onSelect(node.key)}
                        >
                          <span className="block break-words">{node.name}</span>
                          <span className="mt-1 block text-[11px] text-gray-500">
                            {node.type === "CHAPTER"
                              ? "章节"
                              : showQuestionCounts
                                ? `${counts.has(node.key) ? `${counts.get(node.key)} 道关联题` : "待发布 / 未读取关联"}`
                                : "课程知识点"}
                            {node.isKeyTopic ? " · 重点" : ""}
                            {node.isDifficultTopic ? " · 难点" : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          ) : (
            <p className="py-3 text-xs text-gray-500">
              没有匹配节点，请调整筛选条件。
            </p>
          )}
        </div>
      </div>
    </nav>
  );
}
