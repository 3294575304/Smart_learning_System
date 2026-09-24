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
  onSelect,
}: {
  graph: KnowledgeGraphStructure;
  nodes: Node[];
  selectedKey: string | null;
  counts: Map<string, number>;
  onSelect: (key: string) => void;
}) {
  const groups = useMemo(() => {
    const membership = graphChapterMembership(graph);
    const colors = graphChapterColors(graph);
    const sorted = [...nodes].sort(
      (a, b) =>
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
      {
        key: "ungrouped",
        title: "课程与其他节点",
        color: "#334155",
        nodes: sorted.filter((node) => !membership.has(node.key)),
      },
      ...chapters.map((chapter) => ({
        key: chapter.key,
        title: chapter.name,
        color: colors.get(chapter.key) ?? "#334155",
        nodes: sorted.filter(
          (node) => membership.get(node.key) === chapter.key,
        ),
      })),
    ].filter((group) => group.nodes.length);
  }, [graph, nodes]);
  return (
    <nav
      aria-label="按章节查找知识点"
      className="min-w-0 rounded-lg border bg-slate-50 p-3"
    >
      <h4 className="font-medium">节点目录</h4>
      <p className="mt-1 text-xs leading-5 text-gray-500">
        点击中文名称定位，查看知识点与关联题目。
      </p>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto lg:max-h-[700px]">
        {groups.length ? (
          groups.map((group) => (
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
                      className={`w-full rounded border p-2 text-left text-xs leading-5 transition-colors ${selectedKey === node.key ? "font-medium" : "border-transparent hover:bg-slate-100"}`}
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
                        {node.type === "COURSE"
                          ? "课程"
                          : node.type === "CHAPTER"
                            ? "章节"
                            : `${counts.has(node.key) ? `${counts.get(node.key)} 道关联题` : "待发布 / 未读取关联"}`}
                        {node.isKeyTopic ? " · 重点" : ""}
                        {node.isDifficultTopic ? " · 难点" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))
        ) : (
          <p className="py-3 text-xs text-gray-500">
            没有匹配节点，请调整筛选条件。
          </p>
        )}
      </div>
    </nav>
  );
}
