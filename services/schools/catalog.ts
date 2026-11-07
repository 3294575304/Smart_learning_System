import { Prisma, type PrismaClient } from "@prisma/client";

type CatalogDatabaseClient = Prisma.TransactionClient | PrismaClient;

export async function ensureSchoolCatalogDefaults(
  client: CatalogDatabaseClient,
  schoolId: string,
): Promise<void> {
  await client.courseTemplate.upsert({
    where: { schoolId_code: { schoolId, code: "python-programming-v1" } },
    update: {
      name: "Python 程序设计",
      description: "V1.0 Python 程序设计课程模板，用于课程与导入基础建设。",
      version: "1.0",
      isBuiltin: true,
      isActive: true,
    },
    create: {
      schoolId,
      code: "python-programming-v1",
      name: "Python 程序设计",
      description: "V1.0 Python 程序设计课程模板，用于课程与导入基础建设。",
      version: "1.0",
      isBuiltin: true,
      isActive: true,
    },
  });

  await client.questionCourseCategory.upsert({
    where: {
      schoolId_normalizedName: {
        schoolId,
        normalizedName: "python 程序设计",
      },
    },
    update: { name: "Python 程序设计", isActive: true },
    create: {
      schoolId,
      name: "Python 程序设计",
      normalizedName: "python 程序设计",
      isActive: true,
    },
  });
}
