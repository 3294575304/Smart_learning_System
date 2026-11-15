import "server-only";

import {
  AuditAction,
  AuditTargetType,
  Role,
  UserStatus,
  type Role as UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  ChangeInitialPasswordData,
  ChangePasswordData,
} from "@/services/auth/schemas";
import {
  AuthenticationError,
  AuthorizationError,
} from "@/services/auth/policy";
import { hashPassword, verifyPassword } from "@/services/auth/password";

const SELF_SERVICE_PASSWORD_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.TEACHER,
  Role.STUDENT,
] as const;

export class ChangePasswordError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly status = 400,
  ) {
    super(message);
    this.name = "ChangePasswordError";
  }
}

export async function changePassword(
  userId: string,
  input: ChangePasswordData,
): Promise<{ role: UserRole }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      passwordHash: true,
    },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new AuthenticationError("登录状态已失效");
  }
  if (!SELF_SERVICE_PASSWORD_ROLES.includes(user.role)) {
    throw new AuthorizationError("当前账号不可自行修改密码");
  }

  const currentPasswordIsValid = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );
  if (!currentPasswordIsValid) {
    throw new ChangePasswordError("当前密码不正确", {
      currentPassword: ["当前密码不正确"],
    });
  }

  if (input.currentPassword === input.password) {
    throw new ChangePasswordError("新密码不能与当前密码相同", {
      password: ["新密码不能与当前密码相同"],
    });
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (transaction) => {
    const update = await transaction.user.updateMany({
      where: {
        id: user.id,
        passwordHash: user.passwordHash,
        role: { in: [...SELF_SERVICE_PASSWORD_ROLES] },
        status: UserStatus.ACTIVE,
      },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });

    if (update.count !== 1) {
      throw new ChangePasswordError(
        "密码已发生变化，请重新登录后再试",
        {},
        409,
      );
    }

    await transaction.authSession.deleteMany({
      where: { userId: user.id },
    });
    await transaction.auditLog.create({
      data: {
        actorId: user.id,
        action: AuditAction.USER_UPDATED,
        targetType: AuditTargetType.USER,
        targetId: user.id,
        summary: "用户自行修改登录密码",
      },
    });
  });

  return { role: user.role };
}

export class ChangeInitialPasswordError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ChangeInitialPasswordError";
  }
}

export async function changeInitialPassword(
  userId: string,
  input: ChangeInitialPasswordData,
): Promise<{ role: Role; changed: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      passwordHash: true,
      mustChangePassword: true,
    },
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new AuthenticationError("登录状态已失效");
  }

  if (!user.mustChangePassword) {
    return { role: user.role, changed: false };
  }

  const currentPasswordIsValid = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );
  if (!currentPasswordIsValid) {
    throw new ChangeInitialPasswordError("当前初始密码不正确", {
      currentPassword: ["当前初始密码不正确"],
    });
  }

  if (input.currentPassword === input.password) {
    throw new ChangeInitialPasswordError("新密码不能与当前初始密码相同", {
      password: ["新密码不能与当前初始密码相同"],
    });
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    await transaction.authSession.deleteMany({
      where: { userId: user.id },
    });
  });

  return { role: user.role, changed: true };
}
