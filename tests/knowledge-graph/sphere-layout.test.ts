import assert from "node:assert/strict";
import test from "node:test";
import { sphericalGraphLayout } from "@/components/courses/knowledge-graph-sphere-layout";
import {
  chapterGraphLayout,
  graphChapterColors,
} from "@/components/courses/knowledge-graph-presentation";
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

test("二维网图由中心课程、第二层章节向外扩展知识点，不包围章节", () => {
  const graph = fixture();
  const layout = chapterGraphLayout(graph);
  assert.equal(layout.size, graph.nodes.length);
  for (const position of layout.values()) assert.equal(position.z, 0);
  for (const edge of graph.edges) {
    const chapter = layout.get(edge.from);
    const point = layout.get(edge.to);
    assert.ok(chapter && point);
    const radius = Math.hypot(chapter.x, chapter.y);
    assert.ok(Math.hypot(point.x, point.y) > radius + 60);
    assert.ok(
      (point.x * chapter.x + point.y * chapter.y) / radius > radius,
      "子点全部位于章节朝外一侧，不得向课程核心回绕",
    );
    assert.equal(point.color, chapter.color);
  }
});

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
  for (const edge of graph.edges) {
    const parent = layout.get(edge.from);
    const child = layout.get(edge.to);
    assert.ok(parent && child);
    const distance = Math.hypot(
      parent.x - child.x,
      parent.y - child.y,
      parent.z - child.z,
    );
    assert.ok(
      distance >= 60 && distance <= 100,
      "附属知识点保持在章节附近并保留组内间距",
    );
  }
  const course = layout.get("course");
  assert.ok(course);
  for (let i = 1; i <= 11; i++) {
    const chapter = layout.get(`CH-${i}`);
    assert.ok(chapter);
    assert.ok(
      Math.hypot(
        chapter.x - course.x,
        chapter.y - course.y,
        chapter.z - course.z,
      ) <= 220,
      "章节围绕课程核心紧凑排布，避免长距离空白连线",
    );
  }
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
