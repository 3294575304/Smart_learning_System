import assert from "node:assert/strict";
import test from "node:test";
import { sphericalGraphLayout } from "@/components/courses/knowledge-graph-sphere-layout";
import { graphChapterColors } from "@/components/courses/knowledge-graph-presentation";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

function fixture(): KnowledgeGraphStructure {
  const node = (
    key: string,
    type: KnowledgeGraphStructure["nodes"][number]["type"],
    sortOrder: number,
  ) => ({
    key,
    conceptKey: key,
    code: key,
    name: key,
    type,
    sortOrder,
    description: null,
    importance: null,
    isKeyTopic: false,
    isDifficultTopic: false,
    objectiveMappings: [],
    assessmentMappings: [],
    sourceType: "TEACHER" as const,
    sourceRefs: [],
    confidence: null,
    sourcePath: null,
  });
  return {
    nodes: [
      node("course", "COURSE", 0),
      ...Array.from({ length: 11 }, (_, i) =>
        node(`CH-${i + 1}`, "CHAPTER", i),
      ),
      ...Array.from({ length: 83 }, (_, i) =>
        node(`KP-${i + 1}`, "KNOWLEDGE_POINT", i),
      ),
      node("unmapped", "KNOWLEDGE_POINT", 99),
    ],
    edges: Array.from({ length: 83 }, (_, i) => ({
      key: `edge-${i}`,
      from: `CH-${(i % 11) + 1}`,
      to: `KP-${i + 1}`,
      type: "CONTAINS",
      description: null,
      sourceType: "TEACHER",
      sourceRefs: [],
      confidence: null,
    })),
  };
}

test("球形布局覆盖所有节点、保持身份和章节颜色，且不修改业务结构", () => {
  const graph = fixture(),
    original = structuredClone(graph);
  const layout = sphericalGraphLayout(graph),
    colors = graphChapterColors(graph);
  assert.equal(layout.size, graph.nodes.length);
  assert.deepEqual(graph, original);
  assert.deepEqual(layout.get("course"), {
    x: 0,
    y: 0,
    z: 0,
    color: "#0f172a",
  });
  for (let i = 0; i < 83; i++)
    assert.equal(
      layout.get(`KP-${i + 1}`)?.color,
      colors.get(`CH-${(i % 11) + 1}`),
    );
  assert.equal(
    new Set([...layout.values()].map((p) => `${p.x},${p.y},${p.z}`)).size,
    layout.size,
  );
  assert.ok([...layout.values()].some((p) => p.z > 100));
  assert.ok([...layout.values()].some((p) => p.z < -100));
});

test("排序输入、改名称和筛选不导致球形坐标漂移", () => {
  const graph = fixture(),
    layout = sphericalGraphLayout(graph);
  const reordered = {
    ...graph,
    nodes: [...graph.nodes]
      .reverse()
      .map((node) => ({ ...node, name: `修改${node.name}` })),
  };
  assert.deepEqual(sphericalGraphLayout(reordered), layout);
  for (const p of layout.values())
    for (const n of [p.x, p.y, p.z]) assert.ok(Number.isFinite(n));
  assert.equal(sphericalGraphLayout({ nodes: [], edges: [] }).size, 0);
  const isolated = sphericalGraphLayout({
    nodes: graph.nodes.filter((node) => node.key === "unmapped"),
    edges: [],
  });
  assert.ok(Number.isFinite(isolated.get("unmapped")?.z));
});
