import "server-only";

import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getStorageService } from "@/services/storage";
import { partnerSchoolIdSchema } from "@/services/super-admin/provisioning-schemas";
import { buildSchoolDistribution } from "@/services/super-admin/showcase-metrics";

const SCHOOL_LOGO_KEY_PATTERN = /^school-logos\/[0-9a-f-]+\.(png|jpg|webp)$/;

export async function getApplicationShowcase() {
  await requireAuthenticatedUser([Role.SUPER_ADMIN]);
  const schools = await prisma.school.findMany({
    where: { admins: { some: { role: Role.ADMIN, deletedAt: null } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      provinceCode: true,
      createdAt: true,
      updatedAt: true,
      logoUrl: true,
      logoStorageKey: true,
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
        logoUrl:
          school.logoStorageKey &&
          SCHOOL_LOGO_KEY_PATTERN.test(school.logoStorageKey)
            ? `/api/super-admin/schools/${encodeURIComponent(school.id)}/logo?v=${school.updatedAt.getTime()}`
            : school.logoUrl,
        provinceCode: school.provinceCode,
        joinedAt: school.createdAt.toISOString(),
        learners: school._count.admins,
      })),
    ),
    generatedAt: new Date().toISOString(),
  };
}

export async function getApplicationShowcaseSchoolLogo(rawSchoolId: unknown) {
  await requireAuthenticatedUser([Role.SUPER_ADMIN]);
  const schoolId = partnerSchoolIdSchema.parse(rawSchoolId);
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { logoStorageKey: true },
  });
  const key = school?.logoStorageKey;
  if (!key || !SCHOOL_LOGO_KEY_PATTERN.test(key)) return null;

  const extension = key.slice(key.lastIndexOf(".") + 1);
  const contentType =
    extension === "png"
      ? "image/png"
      : extension === "jpg"
        ? "image/jpeg"
        : "image/webp";
  return { data: await getStorageService().read(key), contentType };
}

export type ApplicationShowcaseData = Awaited<
  ReturnType<typeof getApplicationShowcase>
>;
