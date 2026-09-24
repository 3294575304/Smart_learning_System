import assert from "node:assert/strict";
import test from "node:test";

import { filterKnowledgeGraph } from "@/components/courses/knowledge-graph-filter";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

type GraphNode = KnowledgeGraphStructure["nodes"][number];
type GraphEdge = KnowledgeGraphStructure["edges"][number];

function node(key: string, type: GraphNode["type"]): GraphNode {
  return {
    key,
    conceptKey: key,
    code: key,
    name: type === "CHAPTER" ? `第${key.slice(3)}章` : key,
    type,
    description: null,
    importance: null,
    isKeyTopic: false,
    isDifficultTopic: false,
    objectiveMappings: [],
    assessmentMappings: [],
    sourceType: "SYLLABUS",
    sourceRefs: [],
    confidence: null,
    sourcePath: null,
    sortOrder: 0,
  };
}

function edge(from: string, to: string, type: GraphEdge["type"]): GraphEdge {
  return {
    key: `${from}:${to}`,
    from,
    to,
    type,
    description: null,
    sourceType: "SYLLABUS",
    sourceRefs: [],
    confidence: null,
  };
}

const chapters = Array.from({ length: 11 }, (_, i) =>
  node(`CH-${i + 1}`, "CHAPTER"),
);
const graph: KnowledgeGraphStructure = {
  nodes: [
    node("COURSE", "COURSE"),
    ...chapters,
    node("KP-1", "KNOWLEDGE_POINT"),
    node("KP-2", "KNOWLEDGE_POINT"),
  ],
  edges: [
    ...chapters.map((chapter) => edge("COURSE", chapter.key, "CONTAINS")),
    edge("CH-1", "KP-1", "CONTAINS"),
    edge("CH-2", "KP-2", "CONTAINS"),
    edge("KP-1", "KP-2", "PREREQUISITE"),
    edge("KP-2", "KP-1", "RELATED"),
  ],
};

test("章节筛选保留全部 11 章且移除连向隐藏课程和知识点的关系", () => {
  const result = filterKnowledgeGraph(graph, {
    query: "",
    nodeType: "CHAPTER",
    edgeType: "ALL",
  });
  assert.deepEqual(result.nodes, chapters);
  assert.deepEqual(result.edges, []);
});

test("知识点筛选保留先修和相关关系，排除章节包含关系", () => {
  const result = filterKnowledgeGraph(graph, {
    query: "",
    nodeType: "KNOWLEDGE_POINT",
    edgeType: "ALL",
  });
  assert.deepEqual(
    result.nodes.map((item) => item.key),
    ["KP-1", "KP-2"],
  );
  assert.deepEqual(
    result.edges.map((item) => item.type),
    ["PREREQUISITE", "RELATED"],
  );
});

test("关系筛选与节点筛选共同生效", () => {
  const result = filterKnowledgeGraph(graph, {
    query: "",
    nodeType: "KNOWLEDGE_POINT",
    edgeType: "RELATED",
  });
  assert.equal(result.nodes.length, 2);
  assert.deepEqual(result.edges, [graph.edges.at(-1)]);
});

test("按名称或编码搜索单个节点时不留下悬空连线", () => {
  for (const query of ["第2章", " ch-2 "]) {
    const result = filterKnowledgeGraph(graph, {
      query,
      nodeType: "CHAPTER",
      edgeType: "ALL",
    });
    assert.deepEqual(
      result.nodes.map((item) => item.key),
      ["CH-2"],
    );
    assert.deepEqual(result.edges, []);
  }
});

test("无匹配、类型与搜索不符及尚未加载时节点和连线同时为空", () => {
  for (const source of [graph, null]) {
    for (const query of ["missing", "KP-1"]) {
      assert.deepEqual(
        filterKnowledgeGraph(source, {
          query,
          nodeType: "CHAPTER",
          edgeType: "ALL",
        }),
        { nodes: [], edges: [] },
      );
    }
  }
});

test("反复筛选和恢复全部不会修改审核数据或丢失节点与关系", () => {
  const original = structuredClone(graph);
  for (const nodeType of ["CHAPTER", "KNOWLEDGE_POINT", "COURSE"] as const) {
    filterKnowledgeGraph(graph, { query: "", nodeType, edgeType: "ALL" });
  }
  assert.deepEqual(
    filterKnowledgeGraph(graph, {
      query: "",
      nodeType: "ALL",
      edgeType: "ALL",
    }),
    original,
  );
  assert.deepEqual(graph, original);
});
