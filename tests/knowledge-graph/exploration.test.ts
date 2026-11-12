import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  frameGraphNodes,
  focusGraphNode,
  graphNeighborhoods,
} from "@/components/courses/knowledge-graph-exploration";

test("节点聚焦延续当前视线并避开中心轴线，中心节点也具有有效观察位置", () => {
  for (const node of [
    { x: 30, y: -40, z: 50 },
    { x: 0, y: 0, z: 200 },
    { x: 0, y: 200, z: 0 },
    { x: -80, y: 30, z: 200 },
    { x: 80, y: -30, z: -200 },
    { x: 0, y: 0, z: 0 },
  ]) {
    for (const view of [
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
    ]) {
      const before = view.clone();
      const { position, target } = focusGraphNode(node, 260, view);
      assert.ok(Math.abs(position.distanceTo(target) - 260) < 0.001);
      assert.deepEqual(target.toArray(), [node.x, node.y, node.z]);
      assert.deepEqual(view, before, "聚焦计算不得修改当前相机方向输入");
      const direction = position.clone().sub(target).normalize();
      if (target.lengthSq()) {
        assert.ok(
          Math.abs(direction.dot(target.clone().normalize())) < 0.9,
          "课程核心和所选节点不应投影在同一轴线上",
        );
      }
      const originalDirection = view.lengthSq()
        ? view.clone().normalize()
        : new THREE.Vector3(0, 0, 1);
      if (
        !target.lengthSq() ||
        Math.abs(originalDirection.dot(target.clone().normalize())) <= 0.85
      )
        assert.ok(
          direction.distanceTo(originalDirection) < 0.001,
          "无重叠风险时延续当前观察方向",
        );
    }
  }
});

test("关联探索仅包含可见的一跳邻居，隔离节点、重复边和筛选不产生悬空端点", () => {
  const edges = [
    { from: "chapter", to: "a" },
    { from: "a", to: "b" },
    { from: "a", to: "b" },
    { from: "b", to: "hidden" },
    { from: "a", to: "a" },
  ];
  const before = structuredClone(edges);
  const neighborhoods = graphNeighborhoods(
    ["chapter", "a", "b", "isolated"],
    edges,
  );
  assert.deepEqual([...(neighborhoods.get("a") ?? [])].sort(), [
    "a",
    "b",
    "chapter",
  ]);
  assert.deepEqual([...(neighborhoods.get("chapter") ?? [])].sort(), [
    "a",
    "chapter",
  ]);
  assert.deepEqual([...(neighborhoods.get("b") ?? [])].sort(), ["a", "b"]);
  assert.deepEqual([...(neighborhoods.get("isolated") ?? [])], ["isolated"]);
  assert.equal(neighborhoods.has("hidden"), false);
  assert.deepEqual(edges, before);
  assert.equal(graphNeighborhoods([], edges).size, 0);
});

test("镜头框选在宽屏、窄屏和不同角度下容纳具有纵深的节点，且不改变节点坐标", () => {
  const nodes = [
    { x: -600, y: -80, z: 300 },
    { x: 500, y: 400, z: -450 },
    { x: 30, y: -500, z: 20 },
  ];
  const before = structuredClone(nodes);
  for (const aspect of [0.4, 1, 2.4]) {
    for (const direction of [
      new THREE.Vector3(0.24, 0.12, 1),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
    ]) {
      const frame = frameGraphNodes(nodes, aspect, 50, direction);
      assert.ok(frame);
      const camera = new THREE.PerspectiveCamera(50, aspect, 1, 20000);
      camera.position.copy(frame.position);
      // 与框选函数一致，垂直观察时选择非平行的 up。
      if (Math.abs(direction.clone().normalize().y) > 0.99)
        camera.up.set(0, 0, 1);
      camera.lookAt(frame.target);
      camera.updateMatrixWorld();
      for (const node of nodes) {
        const projected = new THREE.Vector3(node.x, node.y, node.z).project(
          camera,
        );
        assert.ok(
          Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1,
          "节点应处于透视视野以内",
        );
      }
    }
  }
  assert.deepEqual(nodes, before);
  const single = frameGraphNodes(
    [{ x: 0, y: 0, z: 0 }],
    1,
    50,
    new THREE.Vector3(),
  );
  assert.ok(single && Number.isFinite(single.position.length()));
  assert.equal(frameGraphNodes([], 1, 50, new THREE.Vector3()), null);
});
