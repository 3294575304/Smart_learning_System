import {
  AuditAction,
  AuditTargetType,
  ClassroomStatus,
  MembershipStatus,
  Prisma,
  StudentImportBatchStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ClassroomOperationError } from "@/services/classrooms/errors";
import { generateJoinCode } from "@/services/classrooms/join-code";
import type { DissolveClassroomData } from "@/services/classrooms/schemas";
import {
  assertClassroomCanAcceptStudents,
  assertMembershipCanJoin,
  assertStudentCanLeave,
} from "@/services/classrooms/policy";
import { notifyClassroomDissolved } from "@/services/notifications/events/classroom";

const INVITE_CODE_ATTEMPTS = 8;

export interface TeacherClassroomListItem {
  id: string;
  name: string;
  description: string | null;
  joinCode: string;
  status: ClassroomStatus;
  allowStudentLeave: boolean;
  studentCount: number;
  course: { id: string; name: string } | null;
  createdAt: Date;
}

export interface ClassroomStudent {
  membershipId: string;
  studentId: string;
  displayName: string | null;
  email: string | null;
  studentNo: string | null;
  joinedAt: Date;
}

export interface TeacherClassroomDetail extends TeacherClassroomListItem {
  joinCodeExpiresAt: Date | null;
  closedAt: Date | null;
  completedAt: Date | null;
  students: ClassroomStudent[];
  studentPage?: { page: number; pageSize: number; totalPages: number };
}

export interface StudentClassroomListItem {
  id: string;
  name: string;
  description: string | null;
  status: ClassroomStatus;
  teacherName: string | null;
  allowStudentLeave: boolean;
  joinedAt: Date;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function requireTeacherClassroom(
  teacherId: string,
  classroomId: string,
): Promise<{
  id: string;
  joinCode: string;
  status: ClassroomStatus;
}> {
  const classroom = await prisma.classroom.findFirst({
    where: {
      id: classroomId,
      teacherId,
      status: { not: ClassroomStatus.ARCHIVED },
    },
    select: { id: true, joinCode: true, status: true },
  });

  if (!classroom) {
    throw new ResourceNotFoundError("班级不存在");
  }

  return classroom;
}

export async function listTeacherClassrooms(
  teacherId: string,
  includeLegacy = false,
): Promise<TeacherClassroomListItem[]> {
  const classrooms = await prisma.classroom.findMany({
    where: {
      teacherId,
      ...(includeLegacy ? {} : { status: { not: ClassroomStatus.ARCHIVED } }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      joinCode: true,
      status: true,
      allowStudentLeave: true,
      createdAt: true,
      course: { select: { id: true, name: true } },
      _count: {
        select: {
          memberships: { where: { status: MembershipStatus.ACTIVE } },
        },
      },
    },
  });

  return classrooms.map(({ _count, ...classroom }) => ({
    ...classroom,
    studentCount: _count.memberships,
  }));
}

export interface ClassroomDissolutionResult {
  id: string;
  name: string;
  releasedStudentCount: number;
  notifiedStudentCount: number;
  dissolvedAt: Date;
}

export interface ClassroomDissolutionDependencies {
  writeAuditLog?: typeof writeGovernanceAuditLog;
  notifyStudents?: typeof notifyClassroomDissolved;
}

function isTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" ||
      (error.code === "P2010" && error.meta?.code === "40001"))
  );
}

export async function dissolveTeacherClassroom(
  teacherId: string,
  classroomId: string,
  input: DissolveClassroomData,
  context: AuditRequestContext,
  dependencies: ClassroomDissolutionDependencies = {},
): Promise<ClassroomDissolutionResult> {
  const writeAuditLog = dependencies.writeAuditLog ?? writeGovernanceAuditLog;
  const notifyStudents =
    dependencies.notifyStudents ?? notifyClassroomDissolved;
  let result: ClassroomDissolutionResult | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const transactionResult = await prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Classroom"
            WHERE "id" = ${classroomId} AND "teacherId" = ${teacherId}
            FOR UPDATE
          `;
          const classroom = await transaction.classroom.findFirst({
            where: { id: classroomId, teacherId },
            select: {
              id: true,
              name: true,
              teacherId: true,
              courseId: true,
              joinCode: true,
              status: true,
              closedAt: true,
              dissolvedAt: true,
              memberships: {
                where: { status: MembershipStatus.ACTIVE },
                select: { studentId: true },
              },
            },
          });
          if (!classroom) {
            throw new ResourceNotFoundError("班级不存在");
          }
          if (
            classroom.status === ClassroomStatus.ARCHIVED ||
            classroom.dissolvedAt
          ) {
            throw new ClassroomOperationError("该班级已经解散。", 409);
          }

          await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "StudentImportBatch"
            WHERE "classroomId" = ${classroomId}
            FOR UPDATE
          `;
          const dissolvedAt = new Date();
          const recipientIds = classroom.memberships.map(
            (membership) => membership.studentId,
          );

          const notificationResult = await notifyStudents(
            {
              classroomId,
              classroomName: classroom.name,
              reason: input.reason,
              recipientIds,
            },
            transaction,
          );

          await transaction.classMembership.updateMany({
            where: { classroomId, status: MembershipStatus.ACTIVE },
            data: { status: MembershipStatus.REMOVED, endedAt: dissolvedAt },
          });
          await transaction.studentIdentityClassroomAssignment.deleteMany({
            where: { classroomId },
          });
          await transaction.studentImportBatch.updateMany({
            where: {
              classroomId,
              status: {
                in: [
                  StudentImportBatchStatus.UPLOADED,
                  StudentImportBatchStatus.PREVIEW_READY,
                  StudentImportBatchStatus.CONFIRMED,
                  StudentImportBatchStatus.PROCESSING,
                ],
              },
            },
            data: {
              status: StudentImportBatchStatus.CANCELLED,
              completedAt: dissolvedAt,
            },
          });
          await transaction.classroom.update({
            where: { id: classroomId },
            data: {
              status: ClassroomStatus.ARCHIVED,
              closedAt: classroom.closedAt ?? dissolvedAt,
              dissolvedAt,
              dissolutionReason: input.reason,
            },
          });

          await writeAuditLog(transaction, {
            actorId: teacherId,
            action: AuditAction.CLASSROOM_DISSOLVED,
            targetType: AuditTargetType.CLASSROOM,
            targetId: classroomId,
            summary: `解散班级：${classroom.name}`,
            beforeData: {
              classroomId,
              name: classroom.name,
              teacherId: classroom.teacherId,
              memberCount: classroom.memberships.length,
              courseId: classroom.courseId,
              joinCode: classroom.joinCode,
              status: classroom.status,
            },
            afterData: {
              classroomId,
              teacherId,
              courseId: classroom.courseId,
              dissolvedById: teacherId,
              dissolvedAt: dissolvedAt.toISOString(),
              dissolutionReason: input.reason,
              status: ClassroomStatus.ARCHIVED,
              notifiedStudentCount: notificationResult.createdCount,
            },
            context,
          });
          return {
            result: {
              id: classroomId,
              name: classroom.name,
              releasedStudentCount: classroom.memberships.length,
              notifiedStudentCount: notificationResult.createdCount,
              dissolvedAt,
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      result = transactionResult.result;
      break;
    } catch (error: unknown) {
      if (isTransactionConflict(error) && attempt < 2) continue;
      throw error;
    }
  }

  if (!result) {
    throw new ClassroomOperationError("班级解散冲突，请稍后重试。", 409);
  }
  return result;
}

export async function getTeacherClassroom(
  teacherId: string,
  classroomId: string,
  studentPage?: number,
): Promise<TeacherClassroomDetail> {
  const classroom = await prisma.classroom.findFirst({
    where: {
      id: classroomId,
      teacherId,
      status: { not: ClassroomStatus.ARCHIVED },
    },
    select: {
      id: true,
      name: true,
      description: true,
      joinCode: true,
      joinCodeExpiresAt: true,
      status: true,
      allowStudentLeave: true,
      closedAt: true,
      completedAt: true,
      createdAt: true,
      course: { select: { id: true, name: true } },
      _count: {
        select: { memberships: { where: { status: MembershipStatus.ACTIVE } } },
      },
      memberships: {
        where: { status: MembershipStatus.ACTIVE },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        ...(studentPage ? { take: 20, skip: (studentPage - 1) * 20 } : {}),
        select: {
          id: true,
          studentId: true,
          joinedAt: true,
          student: {
            select: {
              email: true,
              profile: {
                select: { displayName: true, studentNo: true },
              },
            },
          },
        },
      },
    },
  });

  if (!classroom) {
    throw new ResourceNotFoundError("班级不存在");
  }

  const { memberships, _count, ...classroomData } = classroom;
  return {
    ...classroomData,
    studentCount: _count.memberships,
    ...(studentPage
      ? {
          studentPage: {
            page: studentPage,
            pageSize: 20,
            totalPages: Math.ceil(_count.memberships / 20),
          },
        }
      : {}),
    students: memberships.map((membership) => ({
      membershipId: membership.id,
      studentId: membership.studentId,
      displayName:
        membership.student.profile?.displayName ?? membership.student.email,
      email: membership.student.email,
      studentNo: membership.student.profile?.studentNo ?? null,
      joinedAt: membership.joinedAt,
    })),
  };
}

export async function createClassroom(
  teacherId: string,
  input: {
    name: string;
    description: string | null;
    allowStudentLeave: boolean;
  },
): Promise<TeacherClassroomDetail> {
  for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt += 1) {
    try {
      const classroom = await prisma.classroom.create({
        data: {
          teacherId,
          name: input.name,
          description: input.description,
          allowStudentLeave: input.allowStudentLeave,
          joinCode: generateJoinCode(),
        },
        select: { id: true },
      });

      return getTeacherClassroom(teacherId, classroom.id);
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  throw new ClassroomOperationError("邀请码生成失败，请稍后重试");
}

export async function updateClassroom(
  teacherId: string,
  classroomId: string,
  input: {
    name: string;
    description: string | null;
    allowStudentLeave: boolean;
  },
): Promise<TeacherClassroomDetail> {
  await requireTeacherClassroom(teacherId, classroomId);
  await prisma.classroom.update({
    where: { id: classroomId },
    data: input,
  });

  return getTeacherClassroom(teacherId, classroomId);
}

export async function regenerateClassroomJoinCode(
  teacherId: string,
  classroomId: string,
): Promise<{ joinCode: string }> {
  const classroom = await requireTeacherClassroom(teacherId, classroomId);

  if (classroom.status !== ClassroomStatus.ACTIVE) {
    throw new ClassroomOperationError("已关闭的班级不能重新生成邀请码");
  }

  for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = generateJoinCode();
    if (joinCode === classroom.joinCode) {
      continue;
    }

    try {
      await prisma.classroom.update({
        where: { id: classroomId },
        data: { joinCode, joinCodeExpiresAt: null },
      });
      return { joinCode };
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  throw new ClassroomOperationError("邀请码生成失败，请稍后重试");
}

/** Normal teaching completion preserves memberships and every assignment snapshot. */
export async function completeClassroom(
  teacherId: string,
  classroomId: string,
  context: AuditRequestContext,
): Promise<TeacherClassroomDetail> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw`SELECT "id" FROM "Classroom" WHERE "id" = ${classroomId} AND "teacherId" = ${teacherId} FOR UPDATE`;
          const classroom = await transaction.classroom.findFirst({
            where: { id: classroomId, teacherId },
          });
          if (!classroom) throw new ResourceNotFoundError("班级不存在");
          if (classroom.status === ClassroomStatus.COMPLETED) return;
          if (classroom.status !== ClassroomStatus.ACTIVE)
            throw new ClassroomOperationError("仅授课中的班级可以确认结课");
          const completedAt = new Date();
          await transaction.classroom.update({
            where: { id: classroomId },
            data: { status: ClassroomStatus.COMPLETED, completedAt },
          });
          await writeGovernanceAuditLog(transaction, {
            actorId: teacherId,
            action: AuditAction.CLASSROOM_COMPLETED,
            targetType: AuditTargetType.CLASSROOM,
            targetId: classroomId,
            summary: `教师确认班级结课：${classroom.name}`,
            beforeData: { status: classroom.status },
            afterData: {
              status: ClassroomStatus.COMPLETED,
              completedAt: completedAt.toISOString(),
            },
            context,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error: unknown) {
      if (!isTransactionConflict(error) || attempt === 2) throw error;
    }
  }
  return getTeacherClassroom(teacherId, classroomId);
}

/** Retired teacher closure action; administrative closure belongs to ADMIN. */
export async function closeClassroom(
  teacherId: string,
  classroomId: string,
): Promise<TeacherClassroomDetail> {
  await requireTeacherClassroom(teacherId, classroomId);
  throw new ClassroomOperationError(
    "教师关闭班级入口已停用，请使用确认结课；异常关闭请联系管理员",
  );
}

export async function removeClassroomStudent(
  teacherId: string,
  classroomId: string,
  membershipId: string,
): Promise<{ membershipId: string }> {
  const classroom = await requireTeacherClassroom(teacherId, classroomId);
  if (classroom.status !== ClassroomStatus.ACTIVE)
    throw new ClassroomOperationError(
      "已结课或已关闭的班级保留历史名单，不能移除成员",
    );
  const result = await prisma.classMembership.updateMany({
    where: {
      id: membershipId,
      classroomId,
      status: MembershipStatus.ACTIVE,
    },
    data: { status: MembershipStatus.REMOVED, endedAt: new Date() },
  });

  if (result.count === 0) {
    throw new ResourceNotFoundError("班级成员不存在");
  }

  return { membershipId };
}

export async function listStudentClassrooms(
  studentId: string,
): Promise<StudentClassroomListItem[]> {
  const memberships = await prisma.classMembership.findMany({
    where: { studentId, status: MembershipStatus.ACTIVE },
    orderBy: { joinedAt: "desc" },
    select: {
      joinedAt: true,
      classroom: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          allowStudentLeave: true,
          teacher: {
            select: {
              email: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      },
    },
  });

  return memberships.map(({ joinedAt, classroom }) => ({
    id: classroom.id,
    name: classroom.name,
    description: classroom.description,
    status: classroom.status,
    teacherName:
      classroom.teacher.profile?.displayName ?? classroom.teacher.email,
    allowStudentLeave: classroom.allowStudentLeave,
    joinedAt,
  }));
}

export async function joinClassroom(
  studentId: string,
  joinCode: string,
): Promise<StudentClassroomListItem> {
  const classroom = await prisma.classroom.findUnique({
    where: { joinCode },
    select: {
      id: true,
      status: true,
      joinCodeExpiresAt: true,
    },
  });

  if (!classroom) {
    throw new ResourceNotFoundError("邀请码无效");
  }

  assertClassroomCanAcceptStudents(classroom);
  const existing = await prisma.classMembership.findUnique({
    where: {
      classroomId_studentId: { classroomId: classroom.id, studentId },
    },
    select: { id: true, status: true },
  });
  assertMembershipCanJoin(existing?.status ?? null);

  try {
    if (existing?.status === MembershipStatus.LEFT) {
      const reactivated = await prisma.classMembership.updateMany({
        where: { id: existing.id, status: MembershipStatus.LEFT },
        data: {
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
          endedAt: null,
        },
      });

      if (reactivated.count === 0) {
        throw new ClassroomOperationError("你已经加入该班级");
      }
    } else {
      await prisma.classMembership.create({
        data: { classroomId: classroom.id, studentId },
      });
    }
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      throw new ClassroomOperationError("你已经加入该班级");
    }
    throw error;
  }

  const joinedClassroom = (await listStudentClassrooms(studentId)).find(
    (item) => item.id === classroom.id,
  );
  if (!joinedClassroom) {
    throw new ResourceNotFoundError("班级不存在");
  }

  return joinedClassroom;
}

export async function leaveClassroom(
  studentId: string,
  classroomId: string,
): Promise<{ classroomId: string }> {
  const membership = await prisma.classMembership.findUnique({
    where: { classroomId_studentId: { classroomId, studentId } },
    select: {
      id: true,
      status: true,
      classroom: { select: { allowStudentLeave: true, status: true } },
    },
  });

  if (!membership) {
    throw new ResourceNotFoundError("班级不存在");
  }

  if (membership.classroom.status !== ClassroomStatus.ACTIVE)
    throw new ClassroomOperationError(
      "已结课或已关闭的班级保留历史名单，不能主动退出",
    );
  assertStudentCanLeave({
    membershipStatus: membership.status,
    allowStudentLeave: membership.classroom.allowStudentLeave,
  });

  const result = await prisma.classMembership.updateMany({
    where: { id: membership.id, status: MembershipStatus.ACTIVE },
    data: { status: MembershipStatus.LEFT, endedAt: new Date() },
  });
  if (result.count === 0) {
    throw new ClassroomOperationError("你当前不在该班级中");
  }

  return { classroomId };
}

export async function requireActiveStudentMembership(
  studentId: string,
  classroomId: string,
): Promise<void> {
  const membership = await prisma.classMembership.findFirst({
    where: { classroomId, studentId, status: MembershipStatus.ACTIVE },
    select: { id: true },
  });

  if (!membership) {
    throw new ResourceNotFoundError("班级内容不存在");
  }
}
