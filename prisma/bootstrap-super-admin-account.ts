import { randomBytes } from "node:crypto";
import { Role, UserStatus, type PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

import { adminLoginSchema } from "../services/auth/schemas";

const DEFAULT_SUPER_ADMIN_EMAIL = "superadmin@example.com";

export async function ensureSuperAdminAccount(prisma: PrismaClient) {
  const emailResult = adminLoginSchema.shape.email.safeParse(
    process.env.SEED_SUPER_ADMIN_EMAIL?.trim() || DEFAULT_SUPER_ADMIN_EMAIL,
  );
  if (!emailResult.success) {
    throw new Error("SEED_SUPER_ADMIN_EMAIL must be a valid email address.");
  }

  const email = emailResult.data;
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (existing) {
    if (existing.role !== Role.SUPER_ADMIN) {
      throw new Error(
        `Cannot bootstrap super administrator: ${email} already belongs to another role.`,
      );
    }
    return { created: false as const, email };
  }

  const password =
    process.env.SEED_SUPER_ADMIN_PASSWORD?.trim() ||
    randomBytes(24).toString("base64url");
  const parsedCredentials = adminLoginSchema.safeParse({ email, password });
  if (!parsedCredentials.success) {
    throw new Error(
      "SEED_SUPER_ADMIN_PASSWORD must be between 1 and 72 UTF-8 bytes.",
    );
  }

  const passwordHash = await hash(parsedCredentials.data.password, 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      schoolId: null,
      mustChangePassword: true,
      profile: { create: { displayName: "超级管理员" } },
    },
  });

  return { created: true as const, email, password };
}
