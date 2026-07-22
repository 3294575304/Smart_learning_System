import "server-only";

import { AuditAction, Prisma, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AdminUserOperationError } from "@/services/admin/users/errors";
import {
  assertCanChangeUserRole,
  assertCanChangeUserStatus,
  assertRoleTransitionHasNoBoundData,
} from "@/services/admin/users/policy";
import {
  countActiveAdmins,
  createAdminManagedUser,
  deleteUserSessions,
  findAdminUserById,
  findUserWithEmail,
  loadAdminUserPage,
  updateAdminManagedUser,
  type AdminUserRecord,
} from "@/services/admin/users/repository";
import type {
  AdminUserListQuery,
  CreateAdminUserData,
  UpdateAdminUserData,
} from "@/services/admin/users/schemas";
import type {
  AdminUserListResult,
  AdminUserView,
  RoleBoundRecordCounts,
} from "@/services/admin/users/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { hashPassword } from "@/services/auth/password";
import { writeUserAuditLog } from "@/services/audit/repository";
import type {
  AuditRequestContext,
  AuditUserSnapshot,
} from "@/services/audit/types";

const SERIALIZABLE_RETRY_LIMIT = 3;

function toAdminUserView(record: AdminUserRecord): AdminUserView {
  return {
    id: record.id,
    displayName: record.profile?.displayName ?? record.email,
    email: record.email,
    role: record.role,
    status: record.status,
    lastLoginAt: record.lastLoginAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    summary: {
      studentNo: record.profile?.studentNo ?? null,
      teacherNo: record.profile?.teacherNo ?? null,
      taughtClassroomCount: record._count.taughtClassrooms,
      classMembershipCount: record._count.classMemberships,
      submissionCount: record._count.submissions,
    },
  };
}

function auditSnapshot(record: AdminUserRecord): AuditUserSnapshot {
  return {
    displayName: record.profile?.displayName ?? record.email,
    email: record.email,
    role: record.role,
    status: record.status,
  };
}

function roleBoundCounts(record: AdminUserRecord): RoleBoundRecordCounts {
  return {
    taughtClassrooms: record._count.taughtClassrooms,
    assignments: record._count.assignments,
    createdQuestions: record._count.createdQuestions,
    classMemberships: record._count.classMemberships,
    submissions: record._count.submissions,
    wrongQuestions: record._count.wrongQuestions,
    knowledgeMasteries: record._count.knowledgeMasteries,
    personalizedRecommendations: record._count.personalizedRecommendations,
    aiTutoringRecords: record._count.aiTutoringRecords,
  };
}

async function serializableTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      const shouldRetry =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < SERIALIZABLE_RETRY_LIMIT;
      if (!shouldRetry) throw error;
    }
  }
  throw new AdminUserOperationError("用户状态已发生变化，请重试");
}

function mapUniqueConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AdminUserOperationError("该邮箱已被其他用户使用");
  }
  throw error;
}

export async function listAdminUsers(
  query: AdminUserListQuery,
): Promise<AdminUserListResult> {
  const { total, records } = await loadAdminUserPage(query);
  return {
    items: records.map(toAdminUserView),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getAdminUser(userId: string): Promise<AdminUserView> {
  const user = await findAdminUserById(userId);
  if (!user) throw new ResourceNotFoundError("用户不存在");
  return toAdminUserView(user);
}

export async function createAdminUser(
  actorId: string,
  input: CreateAdminUserData,
  context: AuditRequestContext,
): Promise<AdminUserView> {
  const passwordHash = await hashPassword(input.password);
  try {
    const created = await serializableTransaction(async (transaction) => {
      if (await findUserWithEmail(transaction, input.email)) {
        throw new AdminUserOperationError("该邮箱已被其他用户使用");
      }
      const user = await createAdminManagedUser(transaction, {
        displayName: input.displayName,
        email: input.email,
        passwordHash,
        role: input.role,
      });
      await writeUserAuditLog(transaction, {
        actorId,
        action: AuditAction.USER_CREATED,
        targetId: user.id,
        summary: `创建用户：${auditSnapshot(user).displayName}（${user.email}）`,
        beforeData: null,
        afterData: auditSnapshot(user),
        context,
      });
      return user;
    });
    return toAdminUserView(created);
  } catch (error: unknown) {
    return mapUniqueConflict(error);
  }
}

export async function updateAdminUser(
  actorId: string,
  userId: string,
  input: UpdateAdminUserData,
  context: AuditRequestContext,
): Promise<AdminUserView> {
  try {
    const updated = await serializableTransaction(async (transaction) => {
      const before = await findAdminUserById(userId, transaction);
      if (!before) throw new ResourceNotFoundError("用户不存在");

      const nextRole = input.role ?? before.role;
      const nextStatus = input.status ?? before.status;
      const nextEmail = input.email ?? before.email;
      const nextDisplayName =
        input.displayName ?? before.profile?.displayName ?? before.email;
      const activeAdminCount =
        nextRole !== before.role || nextStatus !== before.status
          ? await countActiveAdmins(transaction)
          : 0;

      assertCanChangeUserRole(actorId, before, nextRole, activeAdminCount);
      assertCanChangeUserStatus(actorId, before, nextStatus, activeAdminCount);
      assertRoleTransitionHasNoBoundData(
        before.role,
        nextRole,
        roleBoundCounts(before),
      );

      if (
        nextEmail !== before.email &&
        (await findUserWithEmail(transaction, nextEmail, userId))
      ) {
        throw new AdminUserOperationError("该邮箱已被其他用户使用");
      }

      const basicChanged =
        nextEmail !== before.email ||
        nextDisplayName !== (before.profile?.displayName ?? before.email);
      const roleChanged = nextRole !== before.role;
      const statusChanged = nextStatus !== before.status;
      if (!basicChanged && !roleChanged && !statusChanged) return before;

      const after = await updateAdminManagedUser(transaction, userId, {
        ...(basicChanged
          ? { email: nextEmail, displayName: nextDisplayName }
          : {}),
        ...(roleChanged ? { role: nextRole } : {}),
        ...(statusChanged ? { status: nextStatus } : {}),
      });
      if (statusChanged && nextStatus === UserStatus.INACTIVE) {
        await deleteUserSessions(transaction, userId);
      }

      const beforeData = auditSnapshot(before);
      const afterData = auditSnapshot(after);
      if (basicChanged) {
        await writeUserAuditLog(transaction, {
          actorId,
          action: AuditAction.USER_UPDATED,
          targetId: userId,
          summary: `更新用户资料：${afterData.displayName}（${afterData.email}）`,
          beforeData,
          afterData,
          context,
        });
      }
      if (roleChanged) {
        await writeUserAuditLog(transaction, {
          actorId,
          action: AuditAction.USER_ROLE_CHANGED,
          targetId: userId,
          summary: `修改用户角色：${before.role} → ${after.role}（${after.email}）`,
          beforeData,
          afterData,
          context,
        });
      }
      if (statusChanged) {
        await writeUserAuditLog(transaction, {
          actorId,
          action:
            nextStatus === UserStatus.ACTIVE
              ? AuditAction.USER_ENABLED
              : AuditAction.USER_DISABLED,
          targetId: userId,
          summary: `${nextStatus === UserStatus.ACTIVE ? "启用" : "禁用"}用户：${afterData.displayName}（${after.email}）`,
          beforeData,
          afterData,
          context,
        });
      }
      return after;
    });
    return toAdminUserView(updated);
  } catch (error: unknown) {
    return mapUniqueConflict(error);
  }
}
