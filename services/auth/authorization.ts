import "server-only";

import type { Role } from "@prisma/client";

import { getCurrentUser } from "@/services/auth/session";
import type { AuthenticatedUser } from "@/services/auth/types";
import {
  assertRole,
  AuthenticationError,
  AuthorizationError,
} from "@/services/auth/policy";
import { assertSystemAvailableForUser } from "@/services/system-config/policy";
import { getSystemConfig } from "@/services/system-config/service";

export {
  assertRole,
  AuthenticationError,
  AuthorizationError,
  getErrorStatus,
  getSafeErrorMessage,
  ResourceNotFoundError,
  roleHomePath,
} from "@/services/auth/policy";

interface RequireAuthenticatedUserOptions {
  allowInitialPasswordChange?: boolean;
}

export async function requireAuthenticatedUser(
  allowedRoles?: readonly Role[],
  options: RequireAuthenticatedUserOptions = {},
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthenticationError();
  }

  if (allowedRoles) {
    assertRole(user, allowedRoles);
  }

  if (user.mustChangePassword && !options.allowInitialPasswordChange) {
    throw new AuthorizationError("请先修改初始密码");
  }

  assertSystemAvailableForUser(user, await getSystemConfig());

  return user;
}
