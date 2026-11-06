import "server-only";

import { Prisma, Role, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/services/auth/policy";

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export async function requireAdminSchoolId(
  actorId: string,
  client: DatabaseClient = prisma,
): Promise<string> {
  const actor = await client.user.findUnique({
    where: { id: actorId },
    select: { role: true, schoolId: true, status: true },
  });
  if (
    actor?.role !== Role.ADMIN ||
    actor.status !== UserStatus.ACTIVE ||
    !actor.schoolId
  ) {
    throw new AuthorizationError("当前管理员尚未绑定学校，无法访问本校数据");
  }
  return actor.schoolId;
}
