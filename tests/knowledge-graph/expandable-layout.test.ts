import assert from "node:assert/strict";
import test from "node:test";
import {
  CLUSTER_REACH,
  expandableSphereLayout,
  sphereNodeVisible,
  wheelExpansion,
} from "@/components/courses/knowledge-graph-expandable-layout";
import {
  HOBERMAN_MAX_RADIUS,
  HOBERMAN_MIN_RADIUS,
  breathingExpansion,
  breathingPhaseAt,
  hobermanMotion,
  sphereMotionModes,
  spherePosition,
} from "@/components/courses/knowledge-graph-hoberman-motion";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

type Point = { x: number; y: number; z: number };

const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const length = (a: Point) => Math.hypot(a.x, a.y, a.z);

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

test("章节与知识点保留原有球形坐标", () => {
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
    assert.ok(
      Math.abs(length(small) - (HOBERMAN_MIN_RADIUS + 2)) < 0.001,
      "收起时章节贴在收紧的球壳上",
    );
    assert.ok(
      Math.abs(length(large) - (HOBERMAN_MAX_RADIUS + 4)) < 0.001,
      "展开时章节推到骨架铰点外沿",
    );
  }

  for (const point of graph.nodes.filter(
    (node) => node.type === "KNOWLEDGE_POINT",
  )) {
    const small = result.collapsed.get(point.key);
    const position = result.expanded.get(point.key);
    assert.ok(small && position);
    assert.ok(
      length(small) < HOBERMAN_MIN_RADIUS,
      "收起时知识点收拢在球体内部",
    );
    assert.ok(
      length(position) > HOBERMAN_MAX_RADIUS,
      "展开时知识点浮到球壳外侧，不被连杆遮挡",
    );
    assert.ok(length(position) < HOBERMAN_MAX_RADIUS + CLUSTER_REACH);
    assert.ok([position.x, position.y, position.z].every(Number.isFinite));
  }
});

test("章节贴向中心课程，知识点的呼吸轨迹与星团铺开大于章节壳层", () => {
  const graph = fixture();
  const layout = expandableSphereLayout(graph);
  const chapterShellTravel =
    HOBERMAN_MAX_RADIUS + 4 - (HOBERMAN_MIN_RADIUS + 2);
  const points = graph.nodes.filter(
    (node) => node.type === "KNOWLEDGE_POINT" && layout.expanded.has(node.key),
  );
  // 知识点从章节内侧一路推到外圈，位移要明显大于章节壳层自身的伸缩。
  const travel = points.reduce((widest, point) => {
    const start = layout.collapsed.get(point.key);
    const end = layout.expanded.get(point.key);
    assert.ok(start && end);
    return Math.max(widest, distance(start, end));
  }, 0);
  assert.ok(travel > chapterShellTravel * 1.3, "呼吸轨迹以知识点为主角");

  // 展开后单章星团的直径要撑过章节壳层的伸缩幅度，才显得铺得开。
  const groups = new Map<string, Point[]>();
  for (const edge of graph.edges) {
    const position = layout.expanded.get(edge.to);
    if (!position) continue;
    const group = groups.get(edge.from) ?? [];
    group.push(position);
    groups.set(edge.from, group);
  }
  const widest = [...groups.values()].reduce((diameter, group) => {
    for (let first = 0; first < group.length; first++)
      for (let second = first + 1; second < group.length; second++)
        diameter = Math.max(diameter, distance(group[first], group[second]));
    return diameter;
  }, 0);
  assert.ok(widest > chapterShellTravel, "章节星团展开得比章节位移更开");
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

test("滚轮向上展开、向下收起并保持边界；收起显示课程与章节", () => {
  assert.ok(wheelExpansion(0.4, -120) > 0.4);
  assert.ok(wheelExpansion(0.4, 120) < 0.4);
  assert.equal(wheelExpansion(1, -1000), 1);
  assert.equal(wheelExpansion(0, 1000), 0);
  assert.equal(wheelExpansion(0.4, 0), 0.4);
  assert.equal(sphereNodeVisible("CHAPTER", 0), true);
  assert.equal(sphereNodeVisible("COURSE", 0), true);
  assert.equal(sphereNodeVisible("COURSE", 1), true);
  assert.equal(sphereNodeVisible("KNOWLEDGE_POINT", 0), false);
  assert.equal(sphereNodeVisible("KNOWLEDGE_POINT", 1), true);
});

test("隐藏骨架后节点沿原有收展轨迹移动，旋转不改变节点间距离", () => {
  const layout = expandableSphereLayout(fixture());
  assert.equal("skeleton" in layout, false);
  assert.equal("scissors" in layout, false);
  for (const [key, start] of layout.collapsed) {
    const end = layout.expanded.get(key);
    assert.ok(end);
    assert.ok(distance(spherePosition(start, end, 0, 0), start) < 1e-9);
    assert.ok(distance(spherePosition(start, end, 1, 0), end) < 1e-9);
    const midpoint = spherePosition(start, end, 0.5, 0);
    assert.ok(
      distance(midpoint, {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        z: (start.z + end.z) / 2,
      }) < 1e-9,
    );
    const rotated = spherePosition(start, end, 0.5, Math.PI / 3);
    assert.ok(Math.abs(length(rotated) - length(midpoint)) < 1e-9);
    assert.ok(
      distance(spherePosition(start, end, 0.5, Math.PI * 2), midpoint) < 1e-9,
      "整圈旋转后回到原坐标",
    );
  }
  const first = layout.collapsed.get("CH-0");
  const second = layout.collapsed.get("CH-1");
  const firstEnd = layout.expanded.get("CH-0");
  const secondEnd = layout.expanded.get("CH-1");
  assert.ok(first && second && firstEnd && secondEnd);
  assert.ok(
    Math.abs(
      distance(first, second) -
        distance(
          spherePosition(first, firstEnd, 0, 1.3),
          spherePosition(second, secondEnd, 0, 1.3),
        ),
    ) < 1e-9,
  );
});

test("呼吸在收起和展开间平滑循环且可从当前展开度启动", () => {
  assert.equal(breathingExpansion(0), 0);
  assert.equal(breathingExpansion(Math.PI), 1);
  assert.ok(Math.abs(breathingExpansion(Math.PI * 2)) < 1e-12);
  for (const progress of [0, 0.25, 0.62, 1]) {
    assert.ok(
      Math.abs(breathingExpansion(breathingPhaseAt(progress)) - progress) <
        1e-12,
    );
  }
  assert.equal(hobermanMotion(-1).radialFraction, 0);
  assert.equal(hobermanMotion(2).radialFraction, 1);
  assert.equal(Math.round(hobermanMotion(0).radius), HOBERMAN_MIN_RADIUS);
  assert.equal(Math.round(hobermanMotion(1).radius), HOBERMAN_MAX_RADIUS);
});

test("自动动效在聚焦、不可见和减少动效时暂停，拖动只暂停旋转", () => {
  const settings = {
    visible: true,
    reducedMotion: false,
    selected: false,
    dragging: false,
    breathing: true,
    autoRotate: true,
  };
  assert.deepEqual(sphereMotionModes(settings), {
    breathe: true,
    rotate: true,
  });
  assert.deepEqual(sphereMotionModes({ ...settings, dragging: true }), {
    breathe: true,
    rotate: false,
  });
  for (const paused of [
    { visible: false },
    { reducedMotion: true },
    { selected: true },
  ])
    assert.deepEqual(sphereMotionModes({ ...settings, ...paused }), {
      breathe: false,
      rotate: false,
    });
  assert.deepEqual(sphereMotionModes(settings), {
    breathe: true,
    rotate: true,
  });
});
