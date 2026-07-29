import "server-only";

import { Prisma, Role, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AdminUserListQuery } from "@/services/admin/users/schemas";

const adminUserSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  email: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      displayName: true,
      studentNo: true,
      teacherNo: true,
    },
  },
  _count: {
    select: {
      taughtClassrooms: true,
      classMemberships: true,
      createdQuestions: true,
      assignments: true,
      submissions: true,
      wrongQuestions: true,
      knowledgeMasteries: true,
      personalizedRecommendations: true,
      aiTutoringRecords: true,
    },
  },
});

export type AdminUserRecord = Prisma.UserGetPayload<{
  select: typeof adminUserSelect;
}>;

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export async function loadAdminUserPage(query: AdminUserListQuery): Promise<{
  total: number;
  records: AdminUserRecord[];
}> {
  const where: Prisma.UserWhereInput = {
    ...(query.keyword
      ? {
          OR: [
            {
              email: { contains: query.keyword, mode: "insensitive" },
            },
            {
              profile: {
                is: {
                  displayName: {
                    contains: query.keyword,
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        }
      : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const orderBy = {
    [query.sortBy]: query.sortOrder,
  } satisfies Prisma.UserOrderByWithRelationInput;

  const [total, records] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: adminUserSelect,
      orderBy: [orderBy, { id: query.sortOrder }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { total, records };
}

export function findAdminUserById(
  userId: string,
  client: DatabaseClient = prisma,
): Promise<AdminUserRecord | null> {
  return client.user.findUnique({
    where: { id: userId },
    select: adminUserSelect,
  });
}

export async function findUserWithEmail(
  client: DatabaseClient,
  email: string | null,
  excludeUserId?: string,
): Promise<{ id: string } | null> {
  if (!email) return null;
  return client.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
}

export async function createAdminManagedUser(
  transaction: Prisma.TransactionClient,
  input: {
    displayName: string;
    email: string;
    passwordHash: string;
    role: Role;
  },
): Promise<AdminUserRecord> {
  return transaction.user.create({
    data: {
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      status: UserStatus.ACTIVE,
      profile: { create: { displayName: input.displayName } },
    },
    select: adminUserSelect,
  });
}

export async function updateAdminManagedUser(
  transaction: Prisma.TransactionClient,
  userId: string,
  input: {
    displayName?: string | null;
    email?: string | null;
    role?: Role;
    status?: UserStatus;
  },
): Promise<AdminUserRecord> {
  return transaction.user.update({
    where: { id: userId },
    data: {
      ...(input.email ? { email: input.email } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.displayName
        ? {
            profile: {
              upsert: {
                create: { displayName: input.displayName },
                update: { displayName: input.displayName },
              },
            },
          }
        : {}),
    },
    select: adminUserSelect,
  });
}

export function countActiveAdmins(
  transaction: Prisma.TransactionClient,
): Promise<number> {
  return transaction.user.count({
    where: { role: Role.ADMIN, status: UserStatus.ACTIVE },
  });
}

export async function deleteUserSessions(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.authSession.deleteMany({ where: { userId } });
}
