import {
  groupKnowledgeChapters,
  type ChapterNode,
} from "@/services/knowledge-graph/chapter-groups";

export function orderedCourseConceptOptions(
  nodes: Array<ChapterNode & { sortOrder: number }>,
  edges: Array<{ fromNodeId: string; toNodeId: string }>,
) {
  const orderedNodes = [...nodes].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
  );
  return groupKnowledgeChapters(orderedNodes, edges).flatMap(
    (chapter, chapterOrder) =>
      chapter.nodes.map((node) => ({
        conceptId: `CODE:${node.code}`,
        code: node.code,
        name: node.name,
        chapterName: chapter.name,
        chapterOrder,
        sortOrder: node.sortOrder,
      })),
  );
}
