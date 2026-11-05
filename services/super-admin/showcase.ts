import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { buildSchoolDistribution } from "@/services/super-admin/showcase-metrics";

export async function getApplicationShowcase() {
  await requireAuthenticatedUser([Role.SUPER_ADMIN]);
  const schools = await prisma.school.findMany({
    where: { admins: { some: { role: Role.ADMIN } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      provinceCode: true,
      createdAt: true,
      _count: {
        select: {
          admins: { where: { role: { in: [Role.TEACHER, Role.STUDENT] } } },
        },
      },
    },
  });
  return {
    ...buildSchoolDistribution(
      schools.map((school) => ({
        id: school.id,
        name: school.name,
        provinceCode: school.provinceCode,
        joinedAt: school.createdAt.toISOString(),
        learners: school._count.admins,
      })),
    ),
    generatedAt: new Date().toISOString(),
  };
}

export type ApplicationShowcaseData = Awaited<
  ReturnType<typeof getApplicationShowcase>
>;
