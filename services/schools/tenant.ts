import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/services/auth/policy";

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export async function requireUserSchoolId(
  userId: string,
  client: DatabaseClient = prisma,
): Promise<string> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { schoolId: true },
  });
  if (!user?.schoolId) {
    throw new AuthorizationError("账号尚未绑定学校，无法访问学校课程资源");
  }
  return user.schoolId;
}
