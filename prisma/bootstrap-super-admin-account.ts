import { Role, UserStatus, type PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";

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
    select: { id: true, role: true, passwordHash: true },
  });
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD?.trim();
  if (existing) {
    if (existing.role !== Role.SUPER_ADMIN) {
      throw new Error(
        `Cannot bootstrap super administrator: ${email} already belongs to another role.`,
      );
    }
    if (!password) {
      throw new Error(
        "SEED_SUPER_ADMIN_PASSWORD is required and must match the existing super administrator password.",
      );
    }
    if (!(await compare(password, existing.passwordHash))) {
      throw new Error(
        "SEED_SUPER_ADMIN_PASSWORD does not match the existing super administrator password; the account was not changed.",
      );
    }
    return { created: false as const, email };
  }

  if (!password) {
    throw new Error(
      "SEED_SUPER_ADMIN_PASSWORD is required to create the super administrator; random passwords are no longer generated.",
    );
  }
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
      mustChangePassword: false,
      profile: { create: { displayName: "超级管理员" } },
    },
  });

  return { created: true as const, email };
}
