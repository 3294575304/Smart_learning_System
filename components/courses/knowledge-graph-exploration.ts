import * as THREE from "three";

/** 延续当前视线聚焦；接近课程—节点轴线时偏转，避免中心球遮住所选节点。 */
export function focusGraphNode(
  node: { x: number; y: number; z: number },
  distance: number,
  viewDirection = new THREE.Vector3(0, 0, 1),
) {
  const target = new THREE.Vector3(node.x, node.y, node.z);
  const direction = viewDirection.clone();
  if (direction.lengthSq() === 0) direction.set(0, 0, 1);
  direction.normalize();
  if (
    target.lengthSq() &&
    Math.abs(direction.dot(target.clone().normalize())) > 0.85
  ) {
    const side = new THREE.Vector3().crossVectors(
      direction,
      new THREE.Vector3(0, 1, 0),
    );
    if (side.lengthSq() < 0.001)
      side.crossVectors(direction, new THREE.Vector3(1, 0, 0));
    // 选取远离核心投影的一侧，避免斜向章节反而被偏转到轴线上。
    if (side.dot(target) * direction.dot(target) > 0) side.negate();
    direction.addScaledVector(side.normalize(), 0.8).normalize();
  }
  return {
    target,
    position: direction.multiplyScalar(distance).add(target),
  };
}

/** 仅使用当前可见节点，筛选后不会高亮或显示隐藏的关系端点。 */
export function graphNeighborhoods(
  nodeKeys: string[],
  edges: Array<{ from: string; to: string }>,
) {
  const neighborhoods = new Map(nodeKeys.map((key) => [key, new Set([key])]));
  for (const edge of edges) {
    const from = neighborhoods.get(edge.from);
    const to = neighborhoods.get(edge.to);
    if (!from || !to) continue;
    from.add(edge.to);
    to.add(edge.from);
  }
  return neighborhoods;
}

/** 在当前观察方向计算透视边界，兼顾窄屏、纵深和离中心较远的节点。 */
export function frameGraphNodes(
  nodes: Array<{ x: number; y: number; z: number }>,
  aspect: number,
  fov: number,
  direction: THREE.Vector3,
) {
  if (!nodes.length) return null;
  const points = nodes.map((node) => new THREE.Vector3(node.x, node.y, node.z));
  const target = new THREE.Box3()
    .setFromPoints(points)
    .getCenter(new THREE.Vector3());
  const forward = direction.clone();
  if (forward.lengthSq() < 0.001) forward.set(0, 0, 1);
  forward.normalize();
  const worldUp =
    Math.abs(forward.y) > 0.99
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, forward).normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const tanVertical = Math.tan(
    (Math.max(10, Math.min(120, fov)) * Math.PI) / 360,
  );
  const tanHorizontal = tanVertical * Math.max(0.1, aspect);
  let distance = 220;
  for (const point of points) {
    const offset = point.clone().sub(target);
    const depth = offset.dot(forward);
    distance = Math.max(
      distance,
      depth + (Math.abs(offset.dot(right)) + 45) / tanHorizontal,
      depth + (Math.abs(offset.dot(up)) + 45) / tanVertical,
    );
  }
  return {
    target,
    position: forward.multiplyScalar(distance * 1.12).add(target),
  };
}
