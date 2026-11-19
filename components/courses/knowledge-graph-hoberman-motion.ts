type Vector3 = { x: number; y: number; z: number };

/**
 * 章节壳层半径：章节名只做课程的索引，所以收缩与展开都压在靠近球心的范围，
 * 外圈留给各章的小知识点去发散。
 */
export const HOBERMAN_MIN_RADIUS = 140;
export const HOBERMAN_MAX_RADIUS = 188;

/** Keep the existing radial path; only its presentation changes. */
export function hobermanMotion(progress: number) {
  const radialFraction = Math.max(0, Math.min(1, progress));
  return {
    radius:
      HOBERMAN_MIN_RADIUS +
      (HOBERMAN_MAX_RADIUS - HOBERMAN_MIN_RADIUS) * radialFraction,
    radialFraction,
  };
}

export function spherePosition(
  start: Vector3,
  end: Vector3,
  progress: number,
  angle: number,
): Vector3 {
  const fraction = hobermanMotion(progress).radialFraction;
  const x = start.x + (end.x - start.x) * fraction;
  const y = start.y + (end.y - start.y) * fraction;
  const z = start.z + (end.z - start.z) * fraction;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: x * cosine + z * sine, y, z: z * cosine - x * sine };
}

/** One full contraction and expansion per cycle, with zero velocity at each end. */
export function breathingExpansion(phase: number) {
  return (1 - Math.cos(phase)) / 2;
}

export function breathingPhaseAt(progress: number) {
  return Math.acos(1 - 2 * hobermanMotion(progress).radialFraction);
}

export function sphereMotionModes({
  visible,
  reducedMotion,
  selected,
  dragging,
  breathing,
  autoRotate,
}: {
  visible: boolean;
  reducedMotion: boolean;
  selected: boolean;
  dragging: boolean;
  breathing: boolean;
  autoRotate: boolean;
}) {
  const active = visible && !reducedMotion && !selected;
  return {
    breathe: active && breathing,
    rotate: active && autoRotate && !dragging,
  };
}
