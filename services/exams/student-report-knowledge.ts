type Chapter = {
  conceptId: string;
  code: string;
  name: string;
  sortOrder: number;
};

type PointNode = {
  id: string;
  nodeType: string;
  code: string;
  name: string;
  sortOrder: number;
  graphVersion: { versionNumber: number };
  incomingEdges: { fromNode: Chapter }[];
};

export function examKnowledgePoints(
  snapshots: {
    conceptId: string;
    resolvedNode: PointNode | null;
    sourceNode: PointNode;
  }[],
) {
  return snapshots.flatMap(({ conceptId, resolvedNode, sourceNode }) => {
    const node = resolvedNode ?? sourceNode;
    if (node.nodeType !== "KNOWLEDGE_POINT") return [];
    return [
      {
        id: conceptId,
        code: node.code,
        name: node.name,
        sortOrder: node.sortOrder,
        version: node.graphVersion.versionNumber,
        chapter: node.incomingEdges[0]?.fromNode ?? null,
      },
    ];
  });
}

type ExamKnowledgePoint = ReturnType<typeof examKnowledgePoints>[number];

function compareOrder(
  a: { sortOrder: number; code: string },
  b: { sortOrder: number; code: string },
) {
  return (
    a.sortOrder - b.sortOrder ||
    a.code.localeCompare(b.code, undefined, { numeric: true })
  );
}

export function groupExamKnowledgePoints<T extends ExamKnowledgePoint>(
  points: T[],
) {
  const groups = new Map<
    string,
    { chapter: Chapter | null; version: number; points: T[] }
  >();
  for (const point of points) {
    const key = point.chapter?.conceptId ?? "unassigned";
    const group = groups.get(key) ?? {
      chapter: point.chapter,
      version: point.version,
      points: [],
    };
    if (point.version > group.version) {
      group.chapter = point.chapter;
      group.version = point.version;
    }
    group.points.push(point);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) =>
      a.chapter && b.chapter
        ? compareOrder(a.chapter, b.chapter)
        : Number(!a.chapter) - Number(!b.chapter),
    )
    .map(({ chapter, points }) => ({
      id: chapter?.conceptId ?? "unassigned",
      name: chapter?.name ?? "未分章知识点",
      points: points.sort(compareOrder),
    }));
}
