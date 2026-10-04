import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

type GraphFilters = {
  query: string;
  nodeType: "ALL" | KnowledgeGraphStructure["nodes"][number]["type"];
  edgeType: "ALL" | KnowledgeGraphStructure["edges"][number]["type"];
  chapterKey?: string;
};

export function graphChapterMembership(graph: KnowledgeGraphStructure) {
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type !== "CONTAINS") continue;
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  }
  const membership = new Map<string, string>();
  for (const chapter of graph.nodes.filter((node) => node.type === "CHAPTER")) {
    const pending = [chapter.key];
    const visited = new Set<string>();
    while (pending.length) {
      const key = pending.pop();
      if (!key || visited.has(key)) continue;
      visited.add(key);
      membership.set(key, chapter.key);
      pending.push(...(children.get(key) ?? []));
    }
  }
  return membership;
}

export function filterKnowledgeGraph(
  graph: KnowledgeGraphStructure | null,
  { query, nodeType, edgeType, chapterKey = "ALL" }: GraphFilters,
): KnowledgeGraphStructure {
  const search = query.trim().toLowerCase();
  const membership =
    graph && chapterKey !== "ALL" ? graphChapterMembership(graph) : null;
  const nodes =
    graph?.nodes.filter(
      (node) =>
        (nodeType === "ALL" || node.type === nodeType) &&
        (!membership ||
          node.type === "COURSE" ||
          membership.get(node.key) === chapterKey) &&
        `${node.code} ${node.name}`.toLowerCase().includes(search),
    ) ?? [];
  const visibleKeys = new Set(nodes.map((node) => node.key));

  // 力导向引擎要求每条连线的两端都存在，不能保留指向已隐藏节点的关系。
  const edges =
    graph?.edges.filter(
      (edge) =>
        (edgeType === "ALL" || edge.type === edgeType) &&
        visibleKeys.has(edge.from) &&
        visibleKeys.has(edge.to),
    ) ?? [];

  return { nodes, edges };
}
