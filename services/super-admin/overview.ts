import "server-only";

import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getSystemConfig } from "@/services/system-config/service";
import { summarizePlatformUsers } from "@/services/super-admin/metrics";

export async function getSuperAdminOverview(now = new Date()) {
  await requireAuthenticatedUser([Role.SUPER_ADMIN]);
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const userGroupsQuery = prisma.user.groupBy({
    by: ["role", "status"],
    orderBy: [{ role: "asc" }, { status: "asc" }],
    _count: { _all: true },
  });
  const [snapshot, config] = await Promise.all([
    // Read related counts from one snapshot during concurrent account creation.
    prisma.$transaction(
      [
        prisma.school.count(),
        prisma.school.count({
          where: { admins: { some: { role: Role.ADMIN } } },
        }),
        userGroupsQuery,
        prisma.user.count({ where: { createdAt: { gte: since, lte: now } } }),
        prisma.user.count({ where: { lastLoginAt: { gte: since, lte: now } } }),
        prisma.course.count(),
        prisma.classroom.count(),
        prisma.classroom.count({ where: { status: "ACTIVE" } }),
        prisma.question.count({ where: { deletedAt: null } }),
        prisma.assignment.count(),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    ),
    getSystemConfig(),
  ]);
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
    settings: {
      maintenanceMode: config.maintenanceMode,
      allowSelfRegistration: config.allowSelfRegistration,
      aiAnalysisEnabled: config.aiAnalysisEnabled,
    },
  };
}

export type SuperAdminOverviewData = Awaited<
  ReturnType<typeof getSuperAdminOverview>
>;
