import "server-only";

import { UserStatus, type Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { ChangeInitialPasswordData } from "@/services/auth/schemas";
import { AuthenticationError } from "@/services/auth/policy";
import { hashPassword, verifyPassword } from "@/services/auth/password";

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
