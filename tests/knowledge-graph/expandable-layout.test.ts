import assert from "node:assert/strict";
import test from "node:test";
import {
  expandableSphereLayout,
  sphereNodeVisible,
  wheelExpansion,
} from "@/components/courses/knowledge-graph-expandable-layout";
import {
  hobermanMotion,
  scissorPairPose,
} from "@/components/courses/knowledge-graph-hoberman-motion";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

function fixture(): KnowledgeGraphStructure {
  const node = (
    key: string,
    type: "COURSE" | "CHAPTER" | "KNOWLEDGE_POINT",
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
      ...Array.from({ length: 11 }, (_, i) => node(`CH-${i}`, "CHAPTER", i)),
      ...Array.from({ length: 83 }, (_, i) =>
        node(`KP-${i}`, "KNOWLEDGE_POINT", i),
      ),
      node("orphan", "KNOWLEDGE_POINT", 99),
    ],
    edges: Array.from({ length: 83 }, (_, i) => ({
      key: `edge-${i}`,
      from: `CH-${i % 11}`,
      to: `KP-${i}`,
      type: "CONTAINS" as const,
      description: null,
      sourceType: "TEACHER" as const,
      sourceRefs: [],
      confidence: null,
    })),
  };
}

test("收起时章节在球面，展开后知识点位于球体内部", () => {
  const graph = fixture();
  const original = structuredClone(graph);
  const result = expandableSphereLayout(graph);
  assert.deepEqual(graph, original);
  assert.equal(result.collapsed.size, graph.nodes.length);
  assert.equal(result.expanded.size, graph.nodes.length);
  for (const chapter of graph.nodes.filter((node) => node.type === "CHAPTER")) {
    const small = result.collapsed.get(chapter.key);
    const large = result.expanded.get(chapter.key);
    assert.ok(small && large);
    assert.ok(Math.abs(Math.hypot(small.x, small.y, small.z) - 110) < 0.001);
    assert.ok(Math.abs(Math.hypot(large.x, large.y, large.z) - 255) < 0.001);
  }
  for (const point of graph.nodes.filter(
    (node) => node.type === "KNOWLEDGE_POINT",
  )) {
    assert.deepEqual(result.collapsed.get(point.key), {
      x: 0,
      y: 0,
      z: 0,
      color: result.expanded.get(point.key)?.color,
    });
    const position = result.expanded.get(point.key);
    assert.ok(position);
    assert.ok(Math.hypot(position.x, position.y, position.z) < 255);
    assert.ok([position.x, position.y, position.z].every(Number.isFinite));
  }
  assert.ok(result.struts.length > 0);
  assert.ok(
    result.struts.every(
      (strut) => result.shell.has(strut.from) && result.shell.has(strut.to),
    ),
  );
});

test("名称与输入顺序不改变伸缩坐标，孤立节点和空图可布局", () => {
  const graph = fixture();
  const baseline = expandableSphereLayout(graph);
  const renamed = {
    nodes: graph.nodes
      .toReversed()
      .map((node) => ({ ...node, name: `修改${node.name}` })),
    edges: graph.edges.toReversed(),
  };
  assert.deepEqual(expandableSphereLayout(renamed), baseline);
  const orphan = baseline.expanded.get("orphan");
  assert.ok(orphan && Number.isFinite(orphan.z));
  assert.equal(
    expandableSphereLayout({ nodes: [], edges: [] }).expanded.size,
    0,
  );
});

test("滚轮向上展开、向下收起并保持边界；收起仅显示章节", () => {
  assert.ok(wheelExpansion(0.4, -120) > 0.4);
  assert.ok(wheelExpansion(0.4, 120) < 0.4);
  assert.equal(wheelExpansion(1, -1000), 1);
  assert.equal(wheelExpansion(0, 1000), 0);
  assert.equal(wheelExpansion(0.4, 0), 0.4);
  assert.equal(sphereNodeVisible("CHAPTER", 0), true);
  assert.equal(sphereNodeVisible("COURSE", 0), false);
  assert.equal(sphereNodeVisible("KNOWLEDGE_POINT", 0), false);
  assert.equal(sphereNodeVisible("KNOWLEDGE_POINT", 1), true);
});

test("剪式杆绕球面转轴开合，四根杆臂长度保持不变", () => {
  const pair = expandableSphereLayout(fixture()).scissors[0];
  assert.ok(pair);
  const distance = (
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const closed = scissorPairPose(pair, 0);
  const open = scissorPairPose(pair, 1);
  assert.ok(
    distance(closed.ends[0], closed.ends[2]) >
      distance(open.ends[0], open.ends[2]),
  );
  for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
    const pose = scissorPairPose(pair, progress);
    const motion = hobermanMotion(progress);
    assert.ok(
      Math.abs(
        motion.halfSpan / motion.radius -
          hobermanMotion(0).halfSpan / hobermanMotion(0).radius,
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(
        Math.hypot(pose.pivot.x, pose.pivot.y, pose.pivot.z) -
          motion.radius -
          motion.pivotLift,
      ) < 1e-8,
    );
    for (const end of pose.ends)
      assert.ok(
        Math.abs(distance(end, pose.pivot) - Math.hypot(50, 10)) < 1e-8,
      );
  }
  assert.equal(hobermanMotion(0).radius, 110);
  assert.equal(hobermanMotion(1).radius, 255);
});
