import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

/** Keep the homepage and course center on the same published chapter ordering. */
export function learningCenterChapters<T extends { key: string }>(
  structure: KnowledgeGraphStructure | null,
  points: T[],
) {
  const byKey = new Map(points.map((point) => [point.key, point]));
  const order = new Map(points.map((point, index) => [point.key, index]));
  return (
    structure?.nodes
      .filter((node) => node.type === "CHAPTER")
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.code.localeCompare(right.code, "zh-CN", { numeric: true }),
      )
      .map((chapter) => ({
        key: chapter.key,
        code: chapter.code,
        name: chapter.name,
        concepts: structure.edges
          .filter(
            (edge) => edge.type === "CONTAINS" && edge.from === chapter.key,
          )
          .map((edge) => byKey.get(edge.to))
          .filter((point): point is T => Boolean(point))
          .sort(
            (left, right) =>
              (order.get(left.key) ?? Number.POSITIVE_INFINITY) -
              (order.get(right.key) ?? Number.POSITIVE_INFINITY),
          ),
      })) ?? []
  );
}
