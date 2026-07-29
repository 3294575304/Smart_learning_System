import type { Role } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  role: Role;
  displayName: string | null;
}
