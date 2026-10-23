import type { AssignmentStatus, Prisma } from "@prisma/client";

export const ASSIGNMENT_FILTER_LABELS = {
  DRAFT: "草稿",
  UPCOMING: "未开始",
  IN_PROGRESS: "进行中",
  EXPIRED: "已截止",
  CLOSED: "已关闭",
  ARCHIVED: "已归档",
  PUBLISHED: "已发布（全部）",
} as const;
export type AssignmentFilterStatus = keyof typeof ASSIGNMENT_FILTER_LABELS;

/** Daily time states are distinct; dormant lifecycle states appear only when useful. */
export function assignmentStatusOptions(
  availableHistory: readonly AssignmentStatus[],
  selected?: AssignmentFilterStatus,
): AssignmentFilterStatus[] {
  const options: AssignmentFilterStatus[] = [
    "DRAFT",
    "UPCOMING",
    "IN_PROGRESS",
    "EXPIRED",
  ];
  for (const status of ["CLOSED", "ARCHIVED"] as const) {
    if (availableHistory.includes(status) || selected === status)
      options.push(status);
  }
  // Keep a legacy selection visible without advertising an overlapping aggregate.
  if (selected === "PUBLISHED") options.push("PUBLISHED");
  return options;
}

export function assignmentDisplayStatus(
  assignment: {
    status: AssignmentStatus;
    publishedAt: Date | null;
    dueAt: Date | null;
  },
  now = new Date(),
): AssignmentFilterStatus {
  if (assignment.status !== "PUBLISHED") return assignment.status;
  if (assignment.publishedAt && assignment.publishedAt > now) return "UPCOMING";
  if (assignment.dueAt && assignment.dueAt <= now) return "EXPIRED";
  return "IN_PROGRESS";
}

export function assignmentStatusWhere(
  status?: AssignmentFilterStatus,
  now = new Date(),
): Prisma.AssignmentWhereInput {
  if (!status) return { status: { not: "ARCHIVED" } };
  if (status === "UPCOMING")
    return { status: "PUBLISHED", publishedAt: { gt: now } };
  // Null dates remain compatible with legacy published records and their card labels.
  if (status === "IN_PROGRESS")
    return {
      status: "PUBLISHED",
      AND: [
        { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
        { OR: [{ dueAt: null }, { dueAt: { gt: now } }] },
      ],
    };
  if (status === "EXPIRED")
    return {
      status: "PUBLISHED",
      dueAt: { lte: now },
      OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
    };
  return { status };
}

export function hundredPointScore(
  score: number | null,
  maxScore: number | null,
): number | null {
  if (
    score === null ||
    maxScore === null ||
    !Number.isFinite(score) ||
    !Number.isFinite(maxScore) ||
    maxScore <= 0
  )
    return null;
  return Math.round((score / maxScore) * 10000) / 100;
}

/** History classification never rewrites published assignment snapshots. */
export function assignmentSectionWhere(
  section: "CURRENT" | "HISTORY",
): Prisma.AssignmentWhereInput {
  return section === "CURRENT"
    ? {
        classroom: { status: "ACTIVE" },
        status: { notIn: ["CLOSED", "ARCHIVED"] },
      }
    : {
        OR: [
          { classroom: { status: { not: "ACTIVE" } } },
          { status: { in: ["CLOSED", "ARCHIVED"] } },
        ],
      };
}
