import { graphChapterMembership } from "@/components/courses/knowledge-graph-filter";
import {
  HOBERMAN_MAX_RADIUS,
  HOBERMAN_MIN_RADIUS,
} from "@/components/courses/knowledge-graph-hoberman-motion";
import { graphChapterColors } from "@/components/courses/knowledge-graph-presentation";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

export interface SpherePosition {
  x: number;
  y: number;
  z: number;
  color: string;
}

interface Direction extends SpherePosition {
  color: string;
}

/** Keep the same 42 anchor directions so existing node paths do not shift. */
const ANCHOR_SUBDIVISION = 1;
/** Knowledge clusters retain their existing radial offset. */
const CLUSTER_LIFT = 16;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

const normalize = (x: number, y: number, z: number) => {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
};

/**
 * Subdivide an icosahedron to preserve the established chapter directions.
 */
function icosphere(level: number) {
  const t = GOLDEN_RATIO;
  const points: Direction[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ].map(([x, y, z]) => ({ ...normalize(x, y, z), color: "#94a3b8" }));
  let faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let step = 0; step < level; step++) {
    const cache = new Map<string, number>();
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const from = points[a];
      const to = points[b];
      points.push({
        ...normalize(
          (from.x + to.x) / 2,
          (from.y + to.y) / 2,
          (from.z + to.z) / 2,
        ),
        color: "#94a3b8",
      });
      const index = points.length - 1;
      cache.set(key, index);
      return index;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return points;
}

/** Place chapter anchors far apart without changing their prior positions. */
function chapterVertices(points: readonly Direction[], count: number) {
  if (!points.length || count <= 0) return [];
  const chosen = [0];
  while (chosen.length < Math.min(count, points.length)) {
    let best = -1;
    let bestScore = Infinity;
    points.forEach((point, index) => {
      if (chosen.includes(index)) return;
      // 与已选铰点的最大余弦值越小，说明离所有已选点越远。
      const nearest = Math.min(
        ...chosen.map(
          (picked) =>
            point.x * points[picked].x +
            point.y * points[picked].y +
            point.z * points[picked].z,
        ),
      );
      if (nearest < bestScore) {
        bestScore = nearest;
        best = index;
      }
    });
    if (best < 0) break;
    chosen.push(best);
  }
  return chosen;
}

export function wheelExpansion(current: number, deltaY: number) {
  if (deltaY === 0) return current;
  const amount = Math.max(0.04, Math.min(0.24, Math.abs(deltaY) / 500));
  return Math.max(0, Math.min(1, current + (deltaY < 0 ? amount : -amount)));
}

export function sphereNodeVisible(
  type: KnowledgeGraphStructure["nodes"][number]["type"],
  expansion: number,
) {
  return type === "CHAPTER" || type === "COURSE" || expansion > 0.12;
}

function tangentBasis(direction: Direction) {
  const axis =
    Math.abs(direction.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const tangent = {
    x: direction.y * axis.z - direction.z * axis.y,
    y: direction.z * axis.x - direction.x * axis.z,
    z: direction.x * axis.y - direction.y * axis.x,
  };
  const length = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
  tangent.x /= length;
  tangent.y /= length;
  tangent.z /= length;
  return {
    tangent,
    bitangent: {
      x: direction.y * tangent.z - direction.z * tangent.y,
      y: direction.z * tangent.x - direction.x * tangent.z,
      z: direction.x * tangent.y - direction.y * tangent.x,
    },
  };
}

/** 星团半径按知识点数量开方归一化，大小章节的视觉权重接近。 */
function clusterSpread(count: number) {
  return Math.min(58, Math.max(24, 16 + Math.sqrt(count) * 8));
}

/** Presentation coordinates only; graph identity and relations are untouched. */
export function expandableSphereLayout(graph: KnowledgeGraphStructure) {
  const ordered = [...graph.nodes].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.code.localeCompare(b.code, "zh-CN", { numeric: true }) ||
      a.key.localeCompare(b.key),
  );
  const chapters = ordered.filter((node) => node.type === "CHAPTER");
  const membership = graphChapterMembership(graph);
  const colors = graphChapterColors(graph);

  const points = icosphere(ANCHOR_SUBDIVISION);

  const collapsed = new Map<string, SpherePosition>();
  const expanded = new Map<string, SpherePosition>();
  const chapterDirections = new Map<string, Direction>();
  const vertices = chapterVertices(points, chapters.length);
  const usedVertices = new Set(vertices);

  chapters.forEach((chapter, index) => {
    const vertex = vertices[index] ?? index % points.length;
    const direction = points[vertex] ?? points[0];
    const color = colors.get(chapter.key) ?? "#0369a1";
    chapterDirections.set(chapter.key, direction);
    // Preserve the existing radial offset for chapter nodes.
    collapsed.set(chapter.key, {
      x: direction.x * (HOBERMAN_MIN_RADIUS + 2),
      y: direction.y * (HOBERMAN_MIN_RADIUS + 2),
      z: direction.z * (HOBERMAN_MIN_RADIUS + 2),
      color,
    });
    expanded.set(chapter.key, {
      x: direction.x * (HOBERMAN_MAX_RADIUS + 4),
      y: direction.y * (HOBERMAN_MAX_RADIUS + 4),
      z: direction.z * (HOBERMAN_MAX_RADIUS + 4),
      color,
    });
  });

  const pointsByChapter = new Map<string, typeof ordered>();
  for (const node of ordered) {
    if (node.type !== "KNOWLEDGE_POINT") continue;
    const chapter = membership.get(node.key) ?? "";
    const bucket = pointsByChapter.get(chapter) ?? [];
    bucket.push(node);
    pointsByChapter.set(chapter, bucket);
  }

  // 未归章的孤立知识点占用剩余铰点，避免全部堆在同一方向。
  const spareVertices = points
    .map((_, index) => index)
    .filter((index) => !usedVertices.has(index));
  let spareIndex = 0;

  for (const [chapterKey, chapterPoints] of pointsByChapter) {
    let direction = chapterDirections.get(chapterKey);
    let color = colors.get(chapterKey) ?? "#047857";
    if (!direction) {
      const vertex =
        spareVertices[spareIndex++ % Math.max(1, spareVertices.length)] ?? 0;
      direction = points[vertex] ?? points[0];
      color = "#64748b";
    }
    const { tangent, bitangent } = tangentBasis(direction);
    const spread = clusterSpread(chapterPoints.length);
    chapterPoints.forEach((point, index) => {
      // 黄金角螺旋铺满圆盘：点位不会沿半径排成一列。
      const radius = Math.sqrt((index + 0.5) / chapterPoints.length);
      const angle = index * GOLDEN_ANGLE;
      const offsetX = Math.cos(angle) * radius * spread;
      const offsetY = Math.sin(angle) * radius * spread;
      const lift = CLUSTER_LIFT + ((index % 3) - 1) * 4;
      expanded.set(point.key, {
        x:
          direction.x * (HOBERMAN_MAX_RADIUS + lift) +
          tangent.x * offsetX +
          bitangent.x * offsetY,
        y:
          direction.y * (HOBERMAN_MAX_RADIUS + lift) +
          tangent.y * offsetX +
          bitangent.y * offsetY,
        z:
          direction.z * (HOBERMAN_MAX_RADIUS + lift) +
          tangent.z * offsetX +
          bitangent.z * offsetY,
        color,
      });
      // 收起时收拢到章节附近，展开过程表现为星团从章节向外绽放。
      collapsed.set(point.key, {
        x: direction.x * HOBERMAN_MIN_RADIUS * 0.9 + tangent.x * offsetX * 0.26,
        y: direction.y * HOBERMAN_MIN_RADIUS * 0.9 + tangent.y * offsetX * 0.26,
        z: direction.z * HOBERMAN_MIN_RADIUS * 0.9 + tangent.z * offsetX * 0.26,
        color,
      });
    });
  }

  ordered
    .filter((node) => node.type === "COURSE")
    .forEach((node) => {
      const position = { x: 0, y: 0, z: 0, color: "#0ea5e9" };
      collapsed.set(node.key, position);
      expanded.set(node.key, position);
    });

  return {
    collapsed,
    expanded,
  };
}
