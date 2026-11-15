type Vector3 = { x: number; y: number; z: number };

export interface ScissorPair {
  direction: Vector3;
  tangent: Vector3;
  lateral: Vector3;
  color: string;
}

const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalize = (v: Vector3): Vector3 => {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};

const halfLength = 50;
const pivotLift = 10;
const openAngle = 1.2;
// Tangential reach and shell radius keep the same ratio at both end states.
const closedAngle = Math.asin((Math.sin(openAngle) * 110) / 255);
const closedSpan = Math.sin(closedAngle) * halfLength;
const openSpan = Math.sin(openAngle) * halfLength;

/** Fixed directions for decorative scissor pairs distributed along the chapter shell. */
export function createScissorPairs(
  shell: ReadonlyMap<string, Vector3>,
  struts: readonly { from: string; to: string; color: string }[],
): ScissorPair[] {
  const pairs: ScissorPair[] = [];
  for (const strut of struts) {
    const a = shell.get(strut.from);
    const b = shell.get(strut.to);
    if (!a || !b) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
    const count = Math.max(
      2,
      Math.min(7, Math.round(angle / (2 * Math.asin(closedSpan / 110)))),
    );
    for (let index = 0; index < count; index++) {
      const fraction = (index + 0.5) / count;
      const sine = Math.sin(angle) || 1;
      const direction = normalize({
        x:
          (a.x * Math.sin((1 - fraction) * angle) +
            b.x * Math.sin(fraction * angle)) /
          sine,
        y:
          (a.y * Math.sin((1 - fraction) * angle) +
            b.y * Math.sin(fraction * angle)) /
          sine,
        z:
          (a.z * Math.sin((1 - fraction) * angle) +
            b.z * Math.sin(fraction * angle)) /
          sine,
      });
      const along = {
        x: b.x - a.x,
        y: b.y - a.y,
        z: b.z - a.z,
      };
      const projection = dot(along, direction);
      const tangent = normalize({
        x: along.x - direction.x * projection,
        y: along.y - direction.y * projection,
        z: along.z - direction.z * projection,
      });
      pairs.push({
        direction,
        tangent,
        lateral: normalize(cross(direction, tangent)),
        color: strut.color,
      });
    }
  }
  return pairs;
}

/** A single degree of freedom rotates fixed-length, bent scissor struts. */
export function hobermanMotion(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  const angle = closedAngle + (openAngle - closedAngle) * clamped;
  const halfSpan = Math.sin(angle) * halfLength;
  const halfWidth = Math.cos(angle) * halfLength;
  const radialFraction = (halfSpan - closedSpan) / (openSpan - closedSpan);
  return {
    radius: 110 + 145 * radialFraction,
    radialFraction,
    halfSpan,
    halfWidth,
    pivotLift,
  };
}

export function scissorPairPose(pair: ScissorPair, progress: number) {
  const motion = hobermanMotion(progress);
  const center = {
    x: pair.direction.x * motion.radius,
    y: pair.direction.y * motion.radius,
    z: pair.direction.z * motion.radius,
  };
  const pivot = {
    x: center.x + pair.direction.x * motion.pivotLift,
    y: center.y + pair.direction.y * motion.pivotLift,
    z: center.z + pair.direction.z * motion.pivotLift,
  };
  const end = (along: number, across: number): Vector3 => ({
    x: center.x + pair.tangent.x * along + pair.lateral.x * across,
    y: center.y + pair.tangent.y * along + pair.lateral.y * across,
    z: center.z + pair.tangent.z * along + pair.lateral.z * across,
  });
  return {
    pivot,
    ends: [
      end(-motion.halfSpan, -motion.halfWidth),
      end(motion.halfSpan, motion.halfWidth),
      end(-motion.halfSpan, motion.halfWidth),
      end(motion.halfSpan, -motion.halfWidth),
    ] as const,
  };
}
