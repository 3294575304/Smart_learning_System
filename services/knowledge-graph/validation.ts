import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

export class KnowledgeGraphValidationError extends Error {
  readonly status = 400;
  readonly code = "GRAPH_STRUCTURE_INVALID";
}

function assertAcyclic(
  edges: Array<{ from: string; to: string }>,
  label: string,
) {
  const next = new Map<string, string[]>();
  for (const edge of edges)
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node))
      throw new KnowledgeGraphValidationError(`${label}不能形成环`);
    if (visited.has(node)) return;
    visiting.add(node);
    for (const target of next.get(node) ?? []) visit(target);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of next.keys()) visit(node);
}

export function validateKnowledgeGraph(graph: KnowledgeGraphStructure): void {
  const keys = new Set<string>();
  const codes = new Set<string>();
  const concepts = new Set<string>();
  const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
  for (const node of graph.nodes) {
    const normalized = node.code.toLocaleLowerCase("en-US");
    if (
      keys.has(node.key) ||
      codes.has(normalized) ||
      concepts.has(node.conceptKey)
    )
      throw new KnowledgeGraphValidationError("节点键、概念身份或编码不能重复");
    keys.add(node.key);
    codes.add(normalized);
    concepts.add(node.conceptKey);
    if (node.sourceType === "AI_INFERRED" && node.confidence === null)
      throw new KnowledgeGraphValidationError("AI 推断节点必须包含置信度");
    if (node.sourceType !== "SYLLABUS" && node.sourceRefs.length > 0)
      throw new KnowledgeGraphValidationError("非大纲来源不能携带大纲证据");
  }
  if (graph.nodes.filter((node) => node.type === "COURSE").length !== 1)
    throw new KnowledgeGraphValidationError("图谱必须且只能包含一个课程节点");
  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    const from = byKey.get(edge.from);
    const to = byKey.get(edge.to);
    if (!from || !to)
      throw new KnowledgeGraphValidationError("关系引用了不存在的节点");
    if (edge.from === edge.to)
      throw new KnowledgeGraphValidationError("关系不能自环");
    const pair =
      edge.type === "RELATED"
        ? [edge.from, edge.to].sort().join("|")
        : `${edge.from}|${edge.to}`;
    const unique = `${edge.type}|${pair}`;
    if (edgeKeys.has(unique))
      throw new KnowledgeGraphValidationError("关系不能重复");
    edgeKeys.add(unique);
    if (
      edge.type === "CONTAINS" &&
      !(
        (from.type === "COURSE" && to.type === "CHAPTER") ||
        (from.type === "CHAPTER" && to.type === "KNOWLEDGE_POINT")
      )
    )
      throw new KnowledgeGraphValidationError("包含关系的节点类型无效");
    if (
      (edge.type === "PREREQUISITE" || edge.type === "RELATED") &&
      (from.type !== "KNOWLEDGE_POINT" || to.type !== "KNOWLEDGE_POINT")
    )
      throw new KnowledgeGraphValidationError(`${edge.type} 只能连接知识点`);
    if (edge.sourceType === "AI_INFERRED" && edge.confidence === null)
      throw new KnowledgeGraphValidationError("AI 推断关系必须包含置信度");
    if (edge.sourceType !== "SYLLABUS" && edge.sourceRefs.length > 0)
      throw new KnowledgeGraphValidationError("非大纲关系不能携带大纲证据");
  }
  assertAcyclic(
    graph.edges.filter((edge) => edge.type === "CONTAINS"),
    "CONTAINS",
  );
  assertAcyclic(
    graph.edges.filter((edge) => edge.type === "PREREQUISITE"),
    "PREREQUISITE",
  );
  const parentCount = new Map<string, number>();
  for (const edge of graph.edges.filter((item) => item.type === "CONTAINS"))
    parentCount.set(edge.to, (parentCount.get(edge.to) ?? 0) + 1);
  for (const node of graph.nodes.filter((item) => item.type !== "COURSE"))
    if (parentCount.get(node.key) !== 1)
      throw new KnowledgeGraphValidationError(
        "每个章节和知识点必须且只能有一个包含父节点",
      );
}
