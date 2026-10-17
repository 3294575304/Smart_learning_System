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
  const clusterRadius = Math.max(90, Math.sqrt(largestCluster) * 32);
  const radius = Math.max(
    340,
    clusterRadius * Math.sqrt(Math.max(1, chapters.length)) * 1.5,
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
    const center = spherePoint(index, chapters.length, radius);
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
        Math.max(75, Math.sqrt(points.length) * 32),
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
