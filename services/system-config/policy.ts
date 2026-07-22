import { Role } from "@prisma/client";

import type { AuthenticatedUser } from "@/services/auth/types";
import {
  MaintenanceModeError,
  SelfRegistrationDisabledError,
} from "@/services/system-config/errors";

export function assertSystemAvailableForUser(
  user: AuthenticatedUser,
  config: { maintenanceMode: boolean; maintenanceMessage: string },
): void {
  if (config.maintenanceMode && user.role !== Role.ADMIN) {
    throw new MaintenanceModeError(config.maintenanceMessage);
  }
}

export function assertSelfRegistrationEnabled(config: {
  allowSelfRegistration: boolean;
}): void {
  if (!config.allowSelfRegistration) {
    throw new SelfRegistrationDisabledError();
  }
}

export function assertRegistrationAvailable(config: {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowSelfRegistration: boolean;
}): void {
  if (config.maintenanceMode) {
    throw new MaintenanceModeError(config.maintenanceMessage);
  }
  assertSelfRegistrationEnabled(config);
}
