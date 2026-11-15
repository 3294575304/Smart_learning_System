import { graphChapterMembership } from "@/components/courses/knowledge-graph-filter";
import { createScissorPairs } from "@/components/courses/knowledge-graph-hoberman-motion";
import { graphChapterColors } from "@/components/courses/knowledge-graph-presentation";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

export interface SpherePosition {
  x: number;
  y: number;
  z: number;
  color: string;
}

const pointOnSphere = (index: number, count: number) => {
  const y = 1 - (2 * (index + 0.5)) / Math.max(count, 1);
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  return { x: Math.cos(angle) * ring, y, z: Math.sin(angle) * ring };
};

export function wheelExpansion(current: number, deltaY: number) {
  if (deltaY === 0) return current;
  const amount = Math.max(0.04, Math.min(0.24, Math.abs(deltaY) / 500));
  return Math.max(0, Math.min(1, current + (deltaY < 0 ? amount : -amount)));
}

export function sphereNodeVisible(
  type: KnowledgeGraphStructure["nodes"][number]["type"],
  expansion: number,
) {
  return (
    type === "CHAPTER" ||
    (type === "KNOWLEDGE_POINT" ? expansion > 0.12 : expansion > 0.45)
  );
}

/** Presentation coordinates only; graph identity and relations are untouched. */
export function expandableSphereLayout(graph: KnowledgeGraphStructure) {
  const ordered = [...graph.nodes].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.code.localeCompare(b.code, "zh-CN", { numeric: true }) ||
      a.key.localeCompare(b.key),
  );
  const chapters = ordered.filter((node) => node.type === "CHAPTER");
  const membership = graphChapterMembership(graph);
  const colors = graphChapterColors(graph);
  const collapsed = new Map<string, SpherePosition>();
  const expanded = new Map<string, SpherePosition>();
  const shell = new Map<string, { x: number; y: number; z: number }>();
  const chapterDirections = new Map<string, ReturnType<typeof pointOnSphere>>();

  chapters.forEach((chapter, index) => {
    const direction = pointOnSphere(index, chapters.length);
    const color = colors.get(chapter.key) ?? "#0369a1";
    chapterDirections.set(chapter.key, direction);
    shell.set(chapter.key, direction);
    collapsed.set(chapter.key, {
      x: direction.x * 110,
      y: direction.y * 110,
      z: direction.z * 110,
      color,
    });
    expanded.set(chapter.key, {
      x: direction.x * 255,
      y: direction.y * 255,
      z: direction.z * 255,
      color,
    });
  });

  const pointsByChapter = new Map<string, typeof ordered>();
  for (const node of ordered) {
    if (node.type !== "KNOWLEDGE_POINT") continue;
    const chapter = membership.get(node.key) ?? "";
    pointsByChapter.set(chapter, [
      ...(pointsByChapter.get(chapter) ?? []),
      node,
    ]);
  }
  for (const [chapterKey, points] of pointsByChapter) {
    const direction = chapterDirections.get(chapterKey) ?? { x: 0, y: 0, z: 1 };
    const color = colors.get(chapterKey) ?? "#047857";
    const axis =
      Math.abs(direction.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const tangentLength = Math.hypot(
      direction.y * axis.z - direction.z * axis.y,
      direction.z * axis.x - direction.x * axis.z,
      direction.x * axis.y - direction.y * axis.x,
    );
    const tangent = {
      x: (direction.y * axis.z - direction.z * axis.y) / tangentLength,
      y: (direction.z * axis.x - direction.x * axis.z) / tangentLength,
      z: (direction.x * axis.y - direction.y * axis.x) / tangentLength,
    };
    const bitangent = {
      x: direction.y * tangent.z - direction.z * tangent.y,
      y: direction.z * tangent.x - direction.x * tangent.z,
      z: direction.x * tangent.y - direction.y * tangent.x,
    };
    points.forEach((point, index) => {
      const spiral = pointOnSphere(index, points.length);
      const radial = chapterKey
        ? 105 + (index % 3) * 19
        : 45 + (index % 3) * 18;
      const spread = Math.min(75, Math.max(34, Math.sqrt(points.length) * 14));
      const position = {
        x:
          direction.x * radial +
          (tangent.x * spiral.x + bitangent.x * spiral.z) * spread,
        y:
          direction.y * radial +
          (tangent.y * spiral.x + bitangent.y * spiral.z) * spread,
        z:
          direction.z * radial +
          (tangent.z * spiral.x + bitangent.z * spiral.z) * spread,
        color,
      };
      expanded.set(point.key, position);
      collapsed.set(point.key, { x: 0, y: 0, z: 0, color });
    });
  }
  ordered
    .filter((node) => node.type === "COURSE")
    .forEach((node) => {
      const position = { x: 0, y: 0, z: 0, color: "#0f172a" };
      collapsed.set(node.key, position);
      expanded.set(node.key, position);
    });

  // Decorative shell struts, not knowledge relations.
  const struts: { from: string; to: string; color: string }[] = [];
  const seen = new Set<string>();
  chapters.forEach((chapter, index) => {
    for (const offset of [1, 3]) {
      if (chapters.length <= offset) continue;
      const other = chapters[(index + offset) % chapters.length];
      const pair = [chapter.key, other.key].sort().join("|");
      if (seen.has(pair)) continue;
      seen.add(pair);
      struts.push({
        from: chapter.key,
        to: other.key,
        color: colors.get(chapter.key) ?? "#0369a1",
      });
    }
  });
  return {
    collapsed,
    expanded,
    shell,
    struts,
    scissors: createScissorPairs(shell, struts),
  };
}
