import "server-only";

import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/services/auth/session";
import type { AuthenticatedUser } from "@/services/auth/types";
import { getSystemConfig } from "@/services/system-config/service";

export async function requirePageRole(role: Role): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== role) {
    redirect("/403");
  }

  const config = await getSystemConfig();
  if (config.maintenanceMode && user.role !== "ADMIN") {
    redirect("/maintenance");
  }

  return user;
}
