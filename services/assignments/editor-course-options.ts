import {
  groupKnowledgeChapters,
  type ChapterNode,
} from "@/services/knowledge-graph/chapter-groups";

interface EditorCourseSource {
  id: string;
  templateId: string;
  name: string;
  courseNo: string;
  term: string;
  currentPublishedKnowledgeGraphVersion: {
    nodes: Array<ChapterNode & { sortOrder: number }>;
    edges: Array<{ fromNodeId: string; toNodeId: string }>;
  } | null;
}

export function buildEditorCourseOptions(
  courses: EditorCourseSource[],
  boundCourseIds: Set<string>,
) {
  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      term: string;
      courseNo: string;
      courseIds: string[];
      chapters: Array<{
        id: string;
        code: string;
        name: string;
        nodes: Array<{ conceptId: string; code: string; name: string }>;
      }>;
    }
  >();
  for (const course of courses) {
    const graph = course.currentPublishedKnowledgeGraphVersion;
    if (!graph || !boundCourseIds.has(course.id)) continue;
    const key = [
      course.templateId,
      course.courseNo,
      course.name,
      course.term,
    ].join("\u0000");
    const group = groups.get(key) ?? {
      id: course.id,
      name: course.name,
      term: course.term,
      courseNo: course.courseNo,
      courseIds: [],
      chapters: [],
    };
    group.courseIds.push(course.id);
    const nodes = [...graph.nodes].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
    );
    for (const chapter of groupKnowledgeChapters(nodes, graph.edges)) {
      const existing = group.chapters.find(
        (item) => item.code === chapter.code,
      );
      if (existing) {
        const ids = new Set(existing.nodes.map((node) => node.conceptId));
        existing.nodes.push(
          ...chapter.nodes.filter((node) => !ids.has(node.conceptId)),
        );
      } else
        group.chapters.push({
          id: chapter.code || chapter.id,
          code: chapter.code,
          name: chapter.name,
          nodes: chapter.nodes,
        });
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    chapters: group.chapters.sort((a, b) =>
      !a.code
        ? 1
        : !b.code
          ? -1
          : a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
    ),
  }));
}
