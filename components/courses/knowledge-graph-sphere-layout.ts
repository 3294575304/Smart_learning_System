import { graphChapterMembership } from "@/components/courses/knowledge-graph-filter";
import { graphChapterColors } from "@/components/courses/knowledge-graph-presentation";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

/** 固定球面上的章节星团；使用完整结构计算，搜索和筛选不改变节点身份与坐标。 */
export function sphericalGraphLayout(graph: KnowledgeGraphStructure) {
  const ordered = [...graph.nodes].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.code.localeCompare(b.code, "zh-CN", { numeric: true }) ||
      a.key.localeCompare(b.key),
  );
  const chapters = ordered.filter((node) => node.type === "CHAPTER");
  const membership = graphChapterMembership(graph);
  const colors = graphChapterColors(graph);
  const positions = new Map<
    string,
    { x: number; y: number; z: number; color: string }
  >();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const largestCluster = Math.max(
    1,
    ...chapters.map(
      (chapter) =>
        ordered.filter(
          (node) =>
            node.type === "KNOWLEDGE_POINT" &&
            membership.get(node.key) === chapter.key,
        ).length,
    ),
  );
  const clusterRadius = Math.max(100, Math.sqrt(largestCluster) * 36);
  const radius = Math.max(
    300,
    clusterRadius * Math.sqrt(Math.max(1, chapters.length)),
  );
  const spherePoint = (index: number, count: number, distance: number) => {
    const y = 1 - (2 * (index + 0.5)) / Math.max(1, count);
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    return {
      x: Math.cos(index * goldenAngle) * ring * distance,
      y: y * distance,
      z: Math.sin(index * goldenAngle) * ring * distance,
    };
  };
  ordered
    .filter((node) => node.type === "COURSE")
    .forEach((node, index) =>
      positions.set(node.key, { x: index * 80, y: 0, z: 0, color: "#0f172a" }),
    );
  chapters.forEach((chapter, index) => {
    // 章节采用错层半径，避免所有星团落在同一个球壳上。
    const center = spherePoint(
      index,
      chapters.length,
      radius * (0.82 + (index % 3) * 0.09),
    );
    const color = colors.get(chapter.key) ?? "#0369a1";
    positions.set(chapter.key, { ...center, color });
    const points = ordered.filter(
      (node) =>
        node.type === "KNOWLEDGE_POINT" &&
        membership.get(node.key) === chapter.key,
    );
    points.forEach((point, pointIndex) => {
      const offset = spherePoint(
        pointIndex,
        points.length,
        Math.max(90, Math.sqrt(points.length) * 36) *
          (0.86 + (pointIndex % 3) * 0.14),
      );
      positions.set(point.key, {
        x: center.x + offset.x,
        y: center.y + offset.y,
        z: center.z + offset.z,
        color,
      });
    });
  });
  const remaining = ordered.filter((node) => !positions.has(node.key));
  remaining.forEach((node, index) =>
    positions.set(node.key, {
      ...spherePoint(index, remaining.length, radius + clusterRadius * 2),
      color: "#047857",
    }),
  );
  return positions;
}
