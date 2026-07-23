import "server-only";

import { MembershipStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AdminClassroomListQuery } from "@/services/admin/classrooms/schemas";

const adminClassroomSelect = Prisma.validator<Prisma.ClassroomSelect>()({
  id: true,
  name: true,
  description: true,
  status: true,
  allowStudentLeave: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
  teacher: {
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true } },
    },
  },
  _count: {
    select: {
      memberships: { where: { status: MembershipStatus.ACTIVE } },
      assignments: true,
    },
  },
  assignments: {
    select: { _count: { select: { submissions: true } } },
  },
});

export type AdminClassroomRecord = Prisma.ClassroomGetPayload<{
  select: typeof adminClassroomSelect;
}>;
type DatabaseClient = typeof prisma | Prisma.TransactionClient;

export async function loadAdminClassroomPage(query: AdminClassroomListQuery) {
  const where: Prisma.ClassroomWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.keyword
      ? {
          OR: [
            { name: { contains: query.keyword, mode: "insensitive" } },
            {
              teacher: {
                email: { contains: query.keyword, mode: "insensitive" },
              },
            },
            {
              teacher: {
                profile: {
                  is: {
                    displayName: {
                      contains: query.keyword,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [total, records] = await prisma.$transaction([
    prisma.classroom.count({ where }),
    prisma.classroom.findMany({
      where,
      select: adminClassroomSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { total, records };
}

export function findAdminClassroomById(
  classroomId: string,
  client: DatabaseClient = prisma,
): Promise<AdminClassroomRecord | null> {
  return client.classroom.findUnique({
    where: { id: classroomId },
    select: adminClassroomSelect,
  });
}
