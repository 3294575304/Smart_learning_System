import "server-only";

import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { summarizePlatformUsers } from "@/services/super-admin/metrics";

export async function getSuperAdminOverview(now = new Date()) {
  await requireAuthenticatedUser([Role.SUPER_ADMIN]);
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const userGroupsQuery = prisma.user.groupBy({
    where: { deletedAt: null },
    by: ["role", "status"],
    orderBy: [{ role: "asc" }, { status: "asc" }],
    _count: { _all: true },
  });
  // Read related counts from one snapshot during concurrent account creation.
  const snapshot = await prisma.$transaction(
    [
      prisma.school.count(),
      prisma.school.count({
        where: { admins: { some: { role: Role.ADMIN, deletedAt: null } } },
      }),
      userGroupsQuery,
      prisma.user.count({
        where: { deletedAt: null, createdAt: { gte: since, lte: now } },
      }),
      prisma.user.count({
        where: { deletedAt: null, lastLoginAt: { gte: since, lte: now } },
      }),
      prisma.course.count(),
      prisma.classroom.count(),
      prisma.classroom.count({ where: { status: "ACTIVE" } }),
      prisma.question.count({ where: { deletedAt: null } }),
      prisma.assignment.count(),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const [
    schoolTotal,
    schoolsInUse,
    userGroups,
    newUsersLast7Days,
    loggedInLast7Days,
    courses,
    classrooms,
    activeClassrooms,
    questions,
    assignments,
  ] = snapshot;
  return {
    generatedAt: now.toISOString(),
    schools: { total: schoolTotal, inUse: schoolsInUse },
    users: {
      ...summarizePlatformUsers(userGroups),
      newLast7Days: newUsersLast7Days,
      loggedInLast7Days,
    },
    teaching: { courses, classrooms, activeClassrooms, questions, assignments },
  };
}

export type SuperAdminOverviewData = Awaited<
  ReturnType<typeof getSuperAdminOverview>
>;
