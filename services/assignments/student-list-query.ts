import type { Prisma } from "@prisma/client";
import type { StudentAssignmentListQuery } from "./schemas";
import { EFFECTIVE_SUBMISSION_STATUSES } from "./reporting";
import { publishedResultsWhere } from "./work-access";

/** Mirrors studentAssignmentState and studentWorkWindow before database pagination. */
export function studentAssignmentListWhere(
  studentId: string,
  status: StudentAssignmentListQuery["status"],
  now: Date,
  courseId?: string,
  classroomId?: string,
): Prisma.AssignmentWhereInput {
  const current: Prisma.AssignmentWhereInput = {
    status: "PUBLISHED",
    classroom: {
      status: "ACTIVE",
      memberships: { some: { studentId, status: "ACTIVE" } },
    },
  };
  const submitted = {
    studentId,
    status: { in: EFFECTIVE_SUBMISSION_STATUSES },
  };
  const draft: Prisma.AssignmentWhereInput = {
    submissions: { some: { studentId, status: "IN_PROGRESS" } },
  };
  const grant: Prisma.AssignmentWhereInput = {
    makeupGrants: {
      some: { studentId, status: "ACTIVE", expiresAt: { gt: now } },
    },
  };
  const unpublished: Prisma.AssignmentWhereInput = {
    submissions: { none: publishedResultsWhere },
  };
  const effectiveGrant: Prisma.AssignmentWhereInput = {
    AND: [grant, unpublished],
  };
  const future: Prisma.AssignmentWhereInput = { dueAt: { gt: now } };
  const conditions: Prisma.AssignmentWhereInput[] = [
    {
      examSessionId: null,
      deletedAt: null,
      status: { in: ["PUBLISHED", "CLOSED"] },
      publishedAt: { lte: now },
      dueAt: { not: null },
      ...(courseId ? { classroom: { courseId } } : {}),
      ...(classroomId ? { classroomId } : {}),
      OR: [current, { submissions: { some: submitted } }],
    },
  ];
  if (status === "TODO")
    conditions.push(
      current,
      unpublished,
      { OR: [future, grant] },
      { OR: [draft, grant, { submissions: { none: submitted } }] },
    );
  if (status === "SUBMITTED")
    conditions.push(
      { submissions: { some: submitted } },
      {
        NOT: {
          AND: [current, { OR: [effectiveGrant, { AND: [draft, future] }] }],
        },
      },
    );
  if (status === "EXPIRED")
    conditions.push(
      { submissions: { none: submitted } },
      { dueAt: { lte: now } },
      { NOT: effectiveGrant },
    );
  return { AND: conditions };
}
