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
  const lines = [""];
  let width = 0;
  for (const char of chars) {
    const charWidth = /[\u0020-\u007e]/u.test(char) ? 0.55 : 1;
    if (width + charWidth > maxLineLength) {
      if (lines.length === 2) return `${lines.join("\n").trimEnd()}…`;
      lines.push("");
      width = 0;
    }
    lines[lines.length - 1] += char;
    width += charWidth;
  }
  return lines.map((line) => line.trim()).join("\n");
}

/** 课程居中、章节作为第二层，知识点沿各章外侧扇区扩展的稳定平面网络。 */
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
  const radius = Math.max(180, chapters.length * 16);
  const sectorAngle = (Math.PI * 2) / Math.max(3, chapters.length);
  const largestPointRows = Math.max(
    1,
    ...[...pointsByChapter.values()].map((points) =>
      Math.ceil(points.length / 3),
    ),
  );
  ordered
    .filter((node) => node.type === "COURSE")
    .forEach((node, index) =>
      positions.set(node.key, {
        x: index * 60,
        y: 0,
        z: 0,
        color: "#0f172a",
      }),
    );
  chapters.forEach((chapter, index) => {
    const angle =
      Math.PI / 2 -
      (index * Math.PI * 2) / chapters.length +
      Math.sin(index * 2.4) * sectorAngle * 0.16;
    // 固定错层和横向展开打破圆环感；仍按顺序分区，筛选不会重新洗牌。
    const distance = radius * (0.85 + (index % 3) * 0.13);
    const x = Math.cos(angle) * distance * 1.22;
    const y = Math.sin(angle) * distance * 0.9;
    const chapterDistance = Math.hypot(x, y);
    const outward = { x: x / chapterDistance, y: y / chapterDistance };
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
      // 子点沿章节向外生长，深度与横向偏移错开，避免形成规则同心圆。
      const depth = 78 + row * 47 + (pointIndex % 3) * 11 + (index % 2) * 8;
      const lateral =
        ((pointIndex % 3) - (rowSize - 1) / 2) * (42 + row * 8) +
        Math.sin((index + 1) * (pointIndex + 1) * 1.7) * 12;
      positions.set(node.key, {
        x: x + outward.x * depth - outward.y * lateral,
        y: y + outward.y * depth + outward.x * lateral,
        z: 0,
        color,
      });
    });
  });
  const remaining = ordered.filter((node) => !positions.has(node.key));
  remaining.forEach((node, index) => {
    const angle = Math.PI / 2 - (index * Math.PI * 2) / remaining.length;
    positions.set(node.key, {
      x: Math.cos(angle) * (radius + 140 + largestPointRows * 56),
      y: Math.sin(angle) * (radius + 140 + largestPointRows * 56),
      z: 0,
      color: "#047857",
    });
  });
  return positions;
}
