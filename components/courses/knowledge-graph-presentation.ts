import { graphChapterMembership } from "@/components/courses/knowledge-graph-filter";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

const chapterColors = [
  "#0369a1",
  "#047857",
  "#7e22ce",
  "#b45309",
  "#be123c",
  "#0e7490",
  "#4338ca",
  "#4d7c0f",
  "#a21caf",
  "#c2410c",
  "#0f766e",
];

export function graphChapterColors(graph: KnowledgeGraphStructure) {
  return new Map(
    graph.nodes
      .filter((node) => node.type === "CHAPTER")
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
      )
      .map((chapter, index) => [
        chapter.key,
        chapterColors[index % chapterColors.length] ?? "#0369a1",
      ]),
  );
}

export function chineseGraphLabel(name: string, maxLineLength = 10) {
  const chars = Array.from(name.trim());
  if (chars.length <= maxLineLength) return name.trim();
  const first = chars.slice(0, maxLineLength).join("");
  const second = chars.slice(maxLineLength, maxLineLength * 2).join("");
  return `${first}\n${second}${chars.length > maxLineLength * 2 ? "…" : ""}`;
}

/** 章节按教学顺序排列，知识点留在所属章节附近，阅读时不再持续漂移。 */
export function chapterGraphLayout(graph: KnowledgeGraphStructure) {
  const ordered = [...graph.nodes].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
  );
  const chapters = ordered.filter((node) => node.type === "CHAPTER");
  const colors = graphChapterColors(graph);
  const membership = graphChapterMembership(graph);
  const pointsByChapter = new Map<string, typeof ordered>();
  for (const node of ordered) {
    const chapter = membership.get(node.key);
    if (node.type !== "KNOWLEDGE_POINT" || !chapter) continue;
    const points = pointsByChapter.get(chapter) ?? [];
    points.push(node);
    pointsByChapter.set(chapter, points);
  }
  const positions = new Map<
    string,
    { x: number; y: number; z: number; color: string }
  >();
  // 每行最多三章，按顺序分区；避免放射状布局把章节标题挤在中心。
  const columns = Math.min(
    3,
    Math.max(1, Math.ceil(Math.sqrt(chapters.length))),
  );
  const rowHeights = Array.from(
    { length: Math.ceil(chapters.length / columns) },
    (_, row) => {
      const pointRows = chapters
        .slice(row * columns, (row + 1) * columns)
        .map((chapter) =>
          Math.ceil((pointsByChapter.get(chapter.key)?.length ?? 0) / 3),
        );
      return Math.max(260, 180 + Math.max(0, ...pointRows) * 95);
    },
  );
  const top = rowHeights.reduce((total, height) => total + height, 0) / 2;
  ordered
    .filter((node) => node.type === "COURSE")
    .forEach((node, index) =>
      positions.set(node.key, {
        x: index * 180,
        y: top + 150,
        z: 0,
        color: "#0f172a",
      }),
    );
  chapters.forEach((chapter, index) => {
    const chapterRow = Math.floor(index / columns);
    const x = ((index % columns) - (columns - 1) / 2) * 440;
    const y =
      top -
      rowHeights
        .slice(0, chapterRow)
        .reduce((total, height) => total + height, 0);
    const color = colors.get(chapter.key) ?? "#0369a1";
    positions.set(chapter.key, {
      x,
      y,
      z: 0,
      color,
    });
    const points = pointsByChapter.get(chapter.key) ?? [];
    points.forEach((node, pointIndex) => {
      const row = Math.floor(pointIndex / 3);
      const rowSize = Math.min(3, points.length - row * 3);
      positions.set(node.key, {
        x: x + ((pointIndex % 3) - (rowSize - 1) / 2) * 110,
        y: y - 105 - row * 95,
        z: ((pointIndex % 3) - 1) * 20,
        color,
      });
    });
  });
  const remaining = ordered.filter((node) => !positions.has(node.key));
  remaining.forEach((node, index) => {
    positions.set(node.key, {
      x: ((index % 3) - 1) * 180,
      y: -top - 100 - Math.floor(index / 3) * 100,
      z: 0,
      color: "#047857",
    });
  });
  return positions;
}
