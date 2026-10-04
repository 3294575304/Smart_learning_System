export interface ChapterNode {
  id: string;
  conceptId: string;
  code: string;
  name: string;
  nodeType: string;
}

/** Published containment edges, rather than naming conventions, define chapters. */
export function groupKnowledgeChapters<T extends ChapterNode>(
  nodes: T[],
  edges: Array<{ fromNodeId: string; toNodeId: string }>,
) {
  const children = new Map<string, string[]>();
  for (const edge of edges)
    children.set(edge.fromNodeId, [
      ...(children.get(edge.fromNodeId) ?? []),
      edge.toNodeId,
    ]);
  const assigned = new Set<string>();
  const groups = nodes
    .filter((node) => node.nodeType === "CHAPTER")
    .map((chapter) => {
      const descendants = new Set<string>();
      const pending = [...(children.get(chapter.id) ?? [])];
      while (pending.length) {
        const id = pending.pop();
        if (!id || descendants.has(id)) continue;
        descendants.add(id);
        pending.push(...(children.get(id) ?? []));
      }
      const points = nodes.filter(
        (node) =>
          node.nodeType === "KNOWLEDGE_POINT" && descendants.has(node.id),
      );
      points.forEach((node) => assigned.add(node.id));
      return {
        id: chapter.id,
        name: chapter.name,
        code: chapter.code,
        nodes: points,
      };
    })
    .filter((group) => group.nodes.length);
  const remaining = nodes.filter(
    (node) => node.nodeType === "KNOWLEDGE_POINT" && !assigned.has(node.id),
  );
  if (remaining.length)
    groups.push({
      id: "ungrouped",
      name: "未分章知识点",
      code: "",
      nodes: remaining,
    });
  return groups;
}
