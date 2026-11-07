import "server-only";

import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  schoolAdminDirectorySchema,
  type SchoolAdminDirectoryQuery,
} from "@/services/super-admin/directory-schemas";

const PAGE_SIZE = 20;

export async function getSchoolAdminDirectory(
  input: SchoolAdminDirectoryQuery,
) {
  await requireAuthenticatedUser([Role.SUPER_ADMIN]);
  const query = schoolAdminDirectorySchema.parse(input);
  return prisma.$transaction(
    async (tx) => {
      if (query.view === "SCHOOLS") {
        const where: Prisma.SchoolWhereInput = query.keyword
          ? { name: { contains: query.keyword, mode: "insensitive" } }
          : {};
        const total = await tx.school.count({ where });
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const page = Math.min(query.page, totalPages);
        const items = await tx.school.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            name: true,
            provinceCode: true,
            createdAt: true,
            _count: { select: { admins: true } },
            admins: { where: { role: Role.ADMIN }, select: { id: true } },
          },
        });
        return {
          view: "SCHOOLS" as const,
          items: items.map(({ admins, _count, ...school }) => ({
            ...school,
            adminCount: admins.length,
            boundUsers: _count.admins,
          })),
          total,
          totalPages,
          page,
        };
      }
      const where: Prisma.UserWhereInput = {
        role: Role.ADMIN,
        ...(query.keyword
          ? {
              OR: [
                { email: { contains: query.keyword, mode: "insensitive" } },
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
                {
                  school: {
                    is: {
                      name: { contains: query.keyword, mode: "insensitive" },
                    },
                  },
                },
              ],
            }
          : {}),
      };
      const total = await tx.user.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(query.page, totalPages);
      const items = await tx.user.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          email: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          profile: { select: { displayName: true } },
          school: { select: { name: true } },
        },
      });
      return {
        view: "ADMINS" as const,
        items,
        total,
        totalPages,
        page,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export type SchoolAdminDirectoryData = Awaited<
  ReturnType<typeof getSchoolAdminDirectory>
>;
