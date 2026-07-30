import "server-only";

import {
  hashPasswordCore,
  verifyPasswordCore,
} from "@/services/auth/password-core";

export function hashPassword(password: string): Promise<string> {
  return hashPasswordCore(password);
}

export function verifyPassword(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  return verifyPasswordCore(password, passwordHash);
}
