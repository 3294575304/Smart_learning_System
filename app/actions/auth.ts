"use server";

import { Role, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getErrorStatus,
  getSafeErrorMessage,
  roleHomePath,
} from "@/services/auth/authorization";
import { verifyPassword } from "@/services/auth/password";
import { validateLoginCaptcha } from "@/services/auth/captcha";
import {
  claimStudentAccount,
  StudentClaimError,
} from "@/services/auth/registration";
import {
  adminLoginSchema,
  changePasswordSchema,
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
  AdminLoginInput,
  ChangePasswordInput,
  ChangeInitialPasswordInput,
  LoginInput,
  RegisterInput,
} from "@/services/auth/schemas";
import {
  changePassword,
  ChangePasswordError,
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

  if (!(await validateLoginCaptcha(parsed.data))) {
    return {
      success: false,
      error: "验证码错误或已过期，请换一张后重试",
      status: 400,
      fieldErrors: { captchaAnswer: ["验证码错误或已过期"] },
    };
  }

  const user = parsed.data.email.includes("@")
    ? await prisma.user.findFirst({
        where: {
          email: parsed.data.email,
          schoolId: parsed.data.schoolId,
          role: { in: [Role.TEACHER, Role.STUDENT] },
        },
      })
    : await prisma.user
        .findMany({
          where: {
            schoolId: parsed.data.schoolId,
            role: { in: [Role.TEACHER, Role.STUDENT] },
            OR: [
              { profile: { studentNo: parsed.data.email } },
              { profile: { teacherNo: parsed.data.email } },
            ],
          },
          take: 2,
        })
        .then((matches) => (matches.length === 1 ? matches[0] : null));
  const passwordIsValid = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? null,
  );

  if (
    !user ||
    !passwordIsValid ||
    user.status !== UserStatus.ACTIVE ||
    user.deletedAt
  ) {
    return {
      success: false,
      error: "账号、密码或所选学校错误，或师生账号当前不可用",
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

export async function adminLoginAction(
  input: AdminLoginInput,
): Promise<ActionResult<RedirectResult>> {
  const parsed = adminLoginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "请检查登录信息",
      status: 400,
      fieldErrors: fieldErrors(parsed.error.flatten().fieldErrors),
    };
  }

  if (!(await validateLoginCaptcha(parsed.data))) {
    return {
      success: false,
      error: "验证码错误或已过期，请换一张后重试",
      status: 400,
      fieldErrors: { captchaAnswer: ["验证码错误或已过期"] },
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  const passwordIsValid = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? null,
  );

  if (
    !user ||
    (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) ||
    !passwordIsValid ||
    user.status !== UserStatus.ACTIVE ||
    user.deletedAt
  ) {
    return {
      success: false,
      error: "账号或密码错误，或管理员账号当前不可用",
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
    console.error("Failed to create administrator login session", error);
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
    const user = await claimStudentAccount(parsed.data);

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
    if (error instanceof StudentClaimError) {
      return {
        success: false,
        error: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
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

export async function changePasswordAction(
  input: ChangePasswordInput,
): Promise<ActionResult<{ changed: boolean }>> {
  const parsed = changePasswordSchema.safeParse(input);

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
    await changePassword(currentUser.id, parsed.data);
    await createSession(currentUser.id);
    return { success: true, data: { changed: true } };
  } catch (error: unknown) {
    if (error instanceof ChangePasswordError) {
      return {
        success: false,
        error: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      };
    }
    const status = getErrorStatus(error);
    if (status >= 500) {
      console.error("Failed to change password", error);
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
