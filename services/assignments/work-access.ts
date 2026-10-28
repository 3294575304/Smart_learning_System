import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { AssignmentOperationError } from "./errors";
import {
  lockAssignmentLifecycle,
  touchAssignmentLifecycle,
} from "./lifecycle-lock";
import { studentWorkWindow } from "./work-window";
import { EFFECTIVE_SUBMISSION_STATUSES } from "./reporting";

export const publishedResultsWhere = {
  OR: [{ status: "PUBLISHED" as const }, { publishedAt: { not: null } }],
};
export async function readStudentWorkAccess(
  assignmentId: string,
  studentId: string,
  submissionId?: string,
) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      classroom: { memberships: { some: { studentId, status: "ACTIVE" } } },
    },
    select: {
      status: true,
      publishedAt: true,
      dueAt: true,
      allowResubmission: true,
      classroom: { select: { status: true } },
      makeupGrants: {
        where: { studentId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { submissions: { where: publishedResultsWhere } } },
    },
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");
  const window = studentWorkWindow(
    assignment,
    assignment.makeupGrants,
    assignment._count.submissions > 0,
  );
  if (
    window.canWrite &&
    !window.grant &&
    submissionId &&
    !assignment.allowResubmission &&
    (await prisma.submission.count({
      where: {
        assignmentId,
        studentId,
        id: { not: submissionId },
        status: { in: EFFECTIVE_SUBMISSION_STATUSES },
      },
    }))
  )
    return {
      ...window,
      canWrite: false,
      reason: "该作业不允许重复提交，补交／重做授权已失效",
    };
  return window;
}
/** Every student write shares the lock used by extension, grants and publication. */
export async function assertStudentWorkAccess(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  studentId: string,
  submissionId?: string,
) {
  const assignment = await lockAssignmentLifecycle(tx, assignmentId);
  const members = await tx.$queryRaw<
    { status: string }[]
  >`SELECT status::text AS status FROM "ClassMembership" WHERE "classroomId"=${assignment.classroom.id} AND "studentId"=${studentId} FOR SHARE`;
  if (members[0]?.status !== "ACTIVE")
    throw new ResourceNotFoundError("作业不存在");
  const [grants, published] = await Promise.all([
    tx.assignmentMakeupGrant.findMany({
      where: { assignmentId, studentId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    }),
    tx.submission.count({ where: { assignmentId, ...publishedResultsWhere } }),
  ]);
  const window = studentWorkWindow(
    assignment,
    grants,
    published > 0,
    new Date(),
  );
  if (!window.canWrite)
    throw new AssignmentOperationError(window.reason ?? "当前不能作答", 409);
  if (
    !window.grant &&
    submissionId &&
    !assignment.allowResubmission &&
    (await tx.submission.count({
      where: {
        assignmentId,
        studentId,
        id: { not: submissionId },
        status: { in: EFFECTIVE_SUBMISSION_STATUSES },
      },
    }))
  )
    throw new AssignmentOperationError(
      "该作业不允许重复提交，补交／重做授权已失效",
      409,
    );
  if (window.grant && submissionId)
    await bindMakeupDraft(tx, window.grant.id, submissionId);
  await touchAssignmentLifecycle(tx, assignmentId);
  return window;
}
export async function bindMakeupDraft(
  tx: Prisma.TransactionClient,
  grantId: string,
  submissionId: string,
) {
  const grant = await tx.assignmentMakeupGrant.findUniqueOrThrow({
    where: { id: grantId },
    select: { submissionId: true },
  });
  if (grant.submissionId && grant.submissionId !== submissionId) {
    const previous = await tx.submission.findUnique({
      where: { id: grant.submissionId },
      select: { status: true },
    });
    if (previous?.status !== "WITHDRAWN")
      throw new AssignmentOperationError(
        "本次授权已绑定另一份草稿，请返回作业继续该次作答",
        409,
      );
  }
  await tx.assignmentMakeupGrant.update({
    where: { id: grantId },
    data: { submissionId },
  });
}
export async function usableGrantWindow(
  tx: Pick<Prisma.TransactionClient, "assignmentMakeupGrant">,
  assignmentId: string,
  now = new Date(),
) {
  const result = await tx.assignmentMakeupGrant.aggregate({
    _count: { _all: true },
    _min: { expiresAt: true },
    where: {
      assignmentId,
      status: "ACTIVE",
      expiresAt: { gt: now },
      assignment: { status: "PUBLISHED", classroom: { status: "ACTIVE" } },
      student: {
        status: "ACTIVE",
        classMemberships: {
          some: {
            status: "ACTIVE",
            classroom: { assignments: { some: { id: assignmentId } } },
          },
        },
      },
    },
  });
  return { count: result._count._all, nextAt: result._min.expiresAt };
}
export async function countUsableGrants(
  tx: Pick<Prisma.TransactionClient, "assignmentMakeupGrant">,
  assignmentId: string,
  now = new Date(),
) {
  return (await usableGrantWindow(tx, assignmentId, now)).count;
}
