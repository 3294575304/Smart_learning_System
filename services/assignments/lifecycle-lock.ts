import "server-only";
import type { Prisma } from "@prisma/client";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { AssignmentOperationError } from "./errors";
import { assignmentCapabilities } from "./capabilities";

/** Class first, then assignment: the same order used by classroom completion. */
export async function lockAssignmentLifecycle(
  transaction: Prisma.TransactionClient,
  assignmentId: string,
  teacherId?: string,
) {
  const owned = await transaction.assignment.findFirst({
    where: { id: assignmentId, ...(teacherId ? { teacherId } : {}) },
    select: { id: true, classroomId: true },
  });
  if (!owned) throw new ResourceNotFoundError("作业不存在");
  await transaction.$queryRaw`SELECT id FROM "Classroom" WHERE id = ${owned.classroomId} FOR SHARE`;
  await transaction.$queryRaw`SELECT id FROM "Assignment" WHERE id = ${assignmentId} FOR UPDATE`;
  return transaction.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      dueAt: true,
      allowResubmission: true,
      classroom: { select: { id: true, status: true } },
    },
  });
}

// Advance the MVCC version so a SERIALIZABLE snapshot taken before waiting retries.
export async function touchAssignmentLifecycle(
  transaction: Prisma.TransactionClient,
  assignmentId: string,
) {
  await transaction.assignment.update({
    where: { id: assignmentId },
    data: { updatedAt: new Date() },
  });
}

export async function gradingAccess(
  transaction: Prisma.TransactionClient,
  assignmentId: string,
  studentId: string,
  teacherId?: string,
) {
  const assignment = await lockAssignmentLifecycle(
    transaction,
    assignmentId,
    teacherId,
  );
  const members = await transaction.$queryRaw<
    { status: string }[]
  >`SELECT status::text AS status FROM "ClassMembership" WHERE "classroomId" = ${assignment.classroom.id} AND "studentId" = ${studentId} FOR SHARE`;
  const reason =
    assignmentCapabilities(assignment).gradingBlockedReason ??
    (members[0]?.status === "ACTIVE"
      ? null
      : "历史成员的作答仅供查看，不能修改成绩");
  return { assignment, reason };
}

export async function assertGradingWritable(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  assignmentId: string,
  studentId: string,
) {
  const access = await gradingAccess(
    transaction,
    assignmentId,
    studentId,
    teacherId,
  );
  if (access.reason) throw new AssignmentOperationError(access.reason, 409);
  await touchAssignmentLifecycle(transaction, assignmentId);
}
