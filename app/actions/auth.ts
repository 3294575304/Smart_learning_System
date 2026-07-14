"use server";

import { Prisma, Role, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getSafeErrorMessage,
  roleHomePath,
} from "@/services/auth/authorization";
import { hashPassword, verifyPassword } from "@/services/auth/password";
import { loginSchema, registerSchema } from "@/services/auth/schemas";
import {
  createSession,
  destroyCurrentSession,
  getCurrentUser,
} from "@/services/auth/session";
import type { LoginInput, RegisterInput } from "@/services/auth/schemas";
import type { ActionResult } from "@/types/action-result";

interface RedirectResult {
  redirectTo: string;
}

function fieldErrors(
  errors: Record<string, string[] | undefined>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(errors).filter(
      (entry): entry is [string, string[]] => entry[1] !== undefined,
    ),
  );
}

export async function loginAction(
  input: LoginInput,
): Promise<ActionResult<RedirectResult>> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "请检查登录信息",
      status: 400,
      fieldErrors: fieldErrors(parsed.error.flatten().fieldErrors),
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  const passwordIsValid = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? null,
  );

  if (!user || !passwordIsValid || user.status !== UserStatus.ACTIVE) {
    return {
      success: false,
      error: "邮箱或密码错误，或账号当前不可用",
      status: 401,
    };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await createSession(user.id);

    return {
      success: true,
      data: { redirectTo: roleHomePath(user.role) },
    };
  } catch (error: unknown) {
    console.error("Failed to create login session", error);
    return {
      success: false,
      error: getSafeErrorMessage(error),
      status: 500,
    };
  }
}

export async function registerAction(
  input: RegisterInput,
): Promise<ActionResult<RedirectResult>> {
  const parsed = registerSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "请检查注册信息",
      status: 400,
      fieldErrors: fieldErrors(parsed.error.flatten().fieldErrors),
    };
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.$transaction(async (transaction) => {
      return transaction.user.create({
        data: {
          email: parsed.data.email,
          passwordHash,
          role: Role.STUDENT,
          profile: {
            create: { displayName: parsed.data.displayName },
          },
        },
      });
    });

    await createSession(user.id);

    return {
      success: true,
      data: { redirectTo: roleHomePath(user.role) },
    };
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "该邮箱已被注册",
        status: 409,
        fieldErrors: { email: ["该邮箱已被注册"] },
      };
    }

    console.error("Failed to register student", error);
    return {
      success: false,
      error: "注册暂时失败，请稍后重试",
      status: 500,
    };
  }
}

export async function logoutAction(): Promise<ActionResult<RedirectResult>> {
  const user = await getCurrentUser();

  if (!user) {
    await destroyCurrentSession();
    return { success: false, error: "登录状态已失效", status: 401 };
  }

  await destroyCurrentSession();
  return { success: true, data: { redirectTo: "/login" } };
}
