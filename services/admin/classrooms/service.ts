import "server-only";

import { AuditAction, AuditTargetType, ClassroomStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  findAdminClassroomById,
  loadAdminClassroomPage,
  type AdminClassroomRecord,
} from "@/services/admin/classrooms/repository";
import { assertAdminCanCloseClassroom } from "@/services/admin/classrooms/policy";
import type { AdminClassroomListQuery } from "@/services/admin/classrooms/schemas";
import type {
  AdminClassroomListResult,
  AdminClassroomView,
} from "@/services/admin/classrooms/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";

function toView(record: AdminClassroomRecord): AdminClassroomView {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    status: record.status,
    allowStudentLeave: record.allowStudentLeave,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    closedAt: record.closedAt,
    teacher: {
      id: record.teacher.id,
      displayName: record.teacher.profile?.displayName ?? record.teacher.email,
      email: record.teacher.email,
    },
    activeStudentCount: record._count.memberships,
    assignmentCount: record._count.assignments,
    submissionCount: record.assignments.reduce(
      (total, assignment) => total + assignment._count.submissions,
      0,
    ),
  };
}

export async function listAdminClassrooms(
  query: AdminClassroomListQuery,
): Promise<AdminClassroomListResult> {
  const { total, records } = await loadAdminClassroomPage(query);
  return {
    items: records.map(toView),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getAdminClassroom(
  classroomId: string,
): Promise<AdminClassroomView> {
  const classroom = await findAdminClassroomById(classroomId);
  if (!classroom) throw new ResourceNotFoundError("班级不存在");
  return toView(classroom);
}

export async function closeAdminClassroom(
  actorId: string,
  classroomId: string,
  context: AuditRequestContext,
): Promise<AdminClassroomView> {
  await prisma.$transaction(async (transaction) => {
    const before = await findAdminClassroomById(classroomId, transaction);
    if (!before) throw new ResourceNotFoundError("班级不存在");
    assertAdminCanCloseClassroom(before.status);
    const closedAt = new Date();
    await transaction.classroom.update({
      where: { id: classroomId },
      data: { status: ClassroomStatus.CLOSED, closedAt },
    });
    await writeGovernanceAuditLog(transaction, {
      actorId,
      action: AuditAction.CLASSROOM_CLOSED_BY_ADMIN,
      targetType: AuditTargetType.CLASSROOM,
      targetId: classroomId,
      summary: `管理员关闭班级：${before.name}`,
      beforeData: {
        status: before.status,
        assignmentCount: before._count.assignments,
        submissionCount: before.assignments.reduce(
          (total, assignment) => total + assignment._count.submissions,
          0,
        ),
      },
      afterData: {
        status: ClassroomStatus.CLOSED,
        closedAt: closedAt.toISOString(),
        assignmentCount: before._count.assignments,
        submissionCount: before.assignments.reduce(
          (total, assignment) => total + assignment._count.submissions,
          0,
        ),
      },
      context,
    });
  });
  return getAdminClassroom(classroomId);
}
