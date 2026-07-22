import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AnnouncementListQuery } from "@/services/announcements/schemas";

export const announcementViewSelect =
  Prisma.validator<Prisma.AnnouncementSelect>()({
    id: true,
    title: true,
    content: true,
    targetType: true,
    status: true,
    publishedAt: true,
    expiresAt: true,
    createdAt: true,
    updatedAt: true,
    createdBy: {
      select: {
        id: true,
        email: true,
        profile: { select: { displayName: true } },
      },
    },
    publishedBy: {
      select: {
        id: true,
        email: true,
        profile: { select: { displayName: true } },
      },
    },
  });

export type AnnouncementViewRecord = Prisma.AnnouncementGetPayload<{
  select: typeof announcementViewSelect;
}>;

export async function loadAnnouncementPage(query: AnnouncementListQuery) {
  const where: Prisma.AnnouncementWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
  };
  const [total, records] = await prisma.$transaction([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      select: announcementViewSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { total, records };
}

export function findAnnouncementById(
  id: string,
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return database.announcement.findUnique({
    where: { id },
    select: announcementViewSelect,
  });
}
