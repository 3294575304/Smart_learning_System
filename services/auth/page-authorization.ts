import "server-only";

import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/services/auth/session";
import type { AuthenticatedUser } from "@/services/auth/types";
import { roleHomePath } from "@/services/auth/policy";
import { getSystemConfig } from "@/services/system-config/service";

interface RequirePageUserOptions {
  allowInitialPasswordChange?: boolean;
}

export async function requireAuthenticatedPageUser(
  options: RequirePageUserOptions = {},
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword && !options.allowInitialPasswordChange) {
    redirect("/change-initial-password");
  }

  if (!user.mustChangePassword && options.allowInitialPasswordChange) {
    redirect(roleHomePath(user.role));
  }

  const config = await getSystemConfig();
  if (config.maintenanceMode && user.role !== "ADMIN") {
    redirect("/maintenance");
  }

  return user;
}

export async function requirePageRole(
  role: Role,
  options: RequirePageUserOptions = {},
): Promise<AuthenticatedUser> {
  const user = await requireAuthenticatedPageUser(options);
  if (user.role !== role) redirect("/403");
  return user;
}
