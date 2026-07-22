import "server-only";

import type { Role } from "@prisma/client";

import { getCurrentUser } from "@/services/auth/session";
import type { AuthenticatedUser } from "@/services/auth/types";
import { assertRole, AuthenticationError } from "@/services/auth/policy";
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

export async function requireAuthenticatedUser(
  allowedRoles?: readonly Role[],
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthenticationError();
  }

  if (allowedRoles) {
    assertRole(user, allowedRoles);
  }

  assertSystemAvailableForUser(user, await getSystemConfig());

  return user;
}
