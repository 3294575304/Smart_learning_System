"use server";

import { Prisma, Role, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getErrorStatus,
  getSafeErrorMessage,
  roleHomePath,
} from "@/services/auth/authorization";
import { hashPassword, verifyPassword } from "@/services/auth/password";
import {
  changeInitialPasswordSchema,
  loginSchema,
  registerSchema,
} from "@/services/auth/schemas";
import {
  createSession,
  destroyCurrentSession,
  getCurrentUser,
} from "@/services/auth/session";
import type {
  ChangeInitialPasswordInput,
  LoginInput,
  RegisterInput,
} from "@/services/auth/schemas";
import {
  changeInitialPassword,
  ChangeInitialPasswordError,
} from "@/services/auth/change-password";
import type { ActionResult } from "@/types/action-result";
import {
  MaintenanceModeError,
  SelfRegistrationDisabledError,
} from "@/services/system-config/errors";
import { assertRegistrationAvailable } from "@/services/system-config/policy";
import { getSystemConfig } from "@/services/system-config/service";

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

  const user = parsed.data.email.includes("@")
    ? await prisma.user.findUnique({
        where: { email: parsed.data.email },
      })
    : await prisma.user.findFirst({
        where: { profile: { studentNo: parsed.data.email } },
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
      data: {
        redirectTo: user.mustChangePassword
          ? "/change-initial-password"
          : roleHomePath(user.role),
      },
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
    assertRegistrationAvailable(await getSystemConfig());
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
      error instanceof SelfRegistrationDisabledError ||
      error instanceof MaintenanceModeError
    ) {
      return { success: false, error: error.message, status: error.status };
    }
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

export async function changeInitialPasswordAction(
  input: ChangeInitialPasswordInput,
): Promise<ActionResult<RedirectResult>> {
  const parsed = changeInitialPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "请检查密码信息",
      status: 400,
      fieldErrors: fieldErrors(parsed.error.flatten().fieldErrors),
    };
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    await destroyCurrentSession();
    return { success: false, error: "请先登录", status: 401 };
  }

  try {
    const result = await changeInitialPassword(currentUser.id, parsed.data);
    if (result.changed) {
      await createSession(currentUser.id);
    }

    return {
      success: true,
      data: { redirectTo: roleHomePath(result.role) },
    };
  } catch (error: unknown) {
    if (error instanceof ChangeInitialPasswordError) {
      return {
        success: false,
        error: error.message,
        status: 400,
        fieldErrors: error.fieldErrors,
      };
    }
    const status = getErrorStatus(error);
    if (status >= 500) {
      console.error("Failed to change initial password", error);
    }
    return {
      success: false,
      error: getSafeErrorMessage(error),
      status,
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
