import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { AuditAction, Prisma, Role, type School } from "@prisma/client";
import { Buffer } from "node:buffer";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { writeSystemConfigAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { MAX_SCHOOL_LOGO_BYTES } from "@/services/schools/constants";
import type { SchoolOption } from "@/services/schools/types";
import { schoolProvinceSchema } from "@/services/schools/provinces";
import { getStorageService } from "@/services/storage";

export const schoolBindingNameSchema = z
  .string()
  .trim()
  .min(2, "请输入学校名称")
  .max(120, "学校名称不能超过 120 个字符");

export class SchoolBindingOperationError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "SchoolBindingOperationError";
  }
}

export interface SchoolImageUpload {
  data: Buffer;
  contentType: string;
}

export interface AdminSchoolBindingView {
  id: string | null;
  name: string;
  provinceCode: string | null;
  logoUrl: string | null;
  nameImageUrl: string | null;
}

export async function getAvailableSchools(): Promise<SchoolOption[]> {
  return prisma.school.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });
}

function schoolKey(name: string): string {
  const normalized = name.normalize("NFKC").toLocaleLowerCase("zh-CN");
  return `school_${createHash("sha256").update(normalized).digest("hex")}`;
}

function schoolImageExtension(
  data: Buffer,
  declaredType: string,
  label: "校徽" | "校名图片",
): string {
  const png =
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff;
  const webp =
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP";

  if (png && declaredType === "image/png") return "png";
  if (jpeg && declaredType === "image/jpeg") return "jpg";
  if (webp && declaredType === "image/webp") return "webp";
  throw new SchoolBindingOperationError(
    `${label}仅支持 PNG、JPG 或 WebP 图片，请检查文件格式。`,
    422,
  );
}

function adminSchoolView(school: {
  id: string;
  name: string;
  provinceCode: string | null;
  logoUrl: string | null;
  logoStorageKey: string | null;
  nameImageStorageKey: string | null;
  updatedAt: Date;
}): AdminSchoolBindingView {
  return {
    id: school.id,
    name: school.name,
    provinceCode: school.provinceCode,
    logoUrl: school.logoStorageKey
      ? `/api/admin/school-binding/logo?v=${school.updatedAt.getTime()}`
      : school.logoUrl,
    nameImageUrl: school.nameImageStorageKey
      ? `/api/admin/school-binding/name-image?v=${school.updatedAt.getTime()}`
      : null,
  };
}

export async function getAdminSchoolBinding(
  adminId: string,
): Promise<AdminSchoolBindingView> {
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { role: true, school: true },
  });
  if (!admin || admin.role !== Role.ADMIN) {
    throw new SchoolBindingOperationError("管理员账号不存在。", 404);
  }
  if (!admin.school) {
    return {
      id: null,
      name: "",
      provinceCode: null,
      logoUrl: null,
      nameImageUrl: null,
    };
  }
  return adminSchoolView(admin.school);
}

export async function updateAdminSchoolBinding(
  adminId: string,
  input: {
    name: string;
    provinceCode?: string | null;
    logo?: SchoolImageUpload;
    nameImage?: SchoolImageUpload;
  },
  context: AuditRequestContext,
): Promise<AdminSchoolBindingView> {
  const name = schoolBindingNameSchema.parse(input.name);
  const provinceCode = schoolProvinceSchema.parse(input.provinceCode);
  let savedLogoKey: string | null = null;
  let savedNameImageKey: string | null = null;

  const logoExt = input.logo
    ? schoolImageExtension(input.logo.data, input.logo.contentType, "校徽")
    : null;
  const nameImageExt = input.nameImage
    ? schoolImageExtension(
        input.nameImage.data,
        input.nameImage.contentType,
        "校名图片",
      )
    : null;
  if (input.logo && input.logo.data.length > MAX_SCHOOL_LOGO_BYTES) {
    throw new SchoolBindingOperationError("校徽图片不能超过 2 MB。", 413);
  }
  if (input.nameImage && input.nameImage.data.length > MAX_SCHOOL_LOGO_BYTES) {
    throw new SchoolBindingOperationError("校名图片不能超过 2 MB。", 413);
  }

  try {
    if (input.logo && logoExt) {
      savedLogoKey = `school-logos/${randomUUID()}.${logoExt}`;
      await getStorageService().save(savedLogoKey, input.logo.data);
    }
    if (input.nameImage && nameImageExt) {
      savedNameImageKey = `school-name-images/${randomUUID()}.${nameImageExt}`;
      await getStorageService().save(savedNameImageKey, input.nameImage.data);
    }
  } catch (error: unknown) {
    if (savedLogoKey) {
      await getStorageService()
        .delete(savedLogoKey)
        .catch(() => undefined);
    }
    if (savedNameImageKey) {
      await getStorageService()
        .delete(savedNameImageKey)
        .catch(() => undefined);
    }
    throw error;
  }

  let replacedLogoKey: string | null = null;
  let replacedNameImageKey: string | null = null;
  let schoolRecord: School;
  try {
    schoolRecord = await prisma.$transaction(
      async (transaction) => {
        const admin = await transaction.user.findUnique({
          where: { id: adminId },
          select: {
            role: true,
            schoolId: true,
            school: {
              select: {
                id: true,
                name: true,
                provinceCode: true,
                logoUrl: true,
                logoStorageKey: true,
                nameImageStorageKey: true,
              },
            },
          },
        });
        if (!admin || admin.role !== Role.ADMIN) {
          throw new SchoolBindingOperationError("管理员账号不存在。", 404);
        }

        let school = await transaction.school.findFirst({
          where: { name },
          orderBy: { createdAt: "asc" },
        });
        const before = {
          schoolId: admin.schoolId,
          schoolName: admin.school?.name ?? null,
          provinceCode: admin.school?.provinceCode ?? null,
          hasSchoolLogo: Boolean(
            admin.school?.logoUrl ?? admin.school?.logoStorageKey,
          ),
          hasSchoolNameImage: Boolean(admin.school?.nameImageStorageKey),
        };

        if (school) {
          if (
            savedLogoKey ||
            savedNameImageKey ||
            (provinceCode !== undefined && provinceCode !== school.provinceCode)
          ) {
            replacedLogoKey = savedLogoKey ? school.logoStorageKey : null;
            replacedNameImageKey = savedNameImageKey
              ? school.nameImageStorageKey
              : null;
            school = await transaction.school.update({
              where: { id: school.id },
              data: {
                ...(provinceCode !== undefined ? { provinceCode } : {}),
                ...(savedLogoKey
                  ? { logoStorageKey: savedLogoKey, logoUrl: null }
                  : {}),
                ...(savedNameImageKey
                  ? { nameImageStorageKey: savedNameImageKey }
                  : {}),
              },
            });
          }
        } else {
          school = await transaction.school.create({
            data: {
              key: schoolKey(name),
              name,
              provinceCode: provinceCode ?? null,
              logoStorageKey: savedLogoKey ?? admin.school?.logoStorageKey,
              logoUrl: savedLogoKey ? null : (admin.school?.logoUrl ?? null),
              nameImageStorageKey:
                savedNameImageKey ?? admin.school?.nameImageStorageKey,
            },
          });
        }

        if (admin.schoolId !== school.id) {
          await transaction.user.update({
            where: { id: adminId },
            data: { schoolId: school.id },
          });
        }

        await writeSystemConfigAuditLog(transaction, {
          actorId: adminId,
          action: AuditAction.SYSTEM_CONFIG_UPDATED,
          targetId: school.id,
          summary: "更新管理员学校绑定信息",
          beforeData: before,
          afterData: {
            schoolId: school.id,
            schoolName: school.name,
            provinceCode: school.provinceCode,
            hasSchoolLogo: Boolean(school.logoUrl ?? school.logoStorageKey),
            hasSchoolNameImage: Boolean(school.nameImageStorageKey),
          },
          context,
        });

        return school;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error: unknown) {
    if (savedLogoKey) {
      await getStorageService()
        .delete(savedLogoKey)
        .catch(() => undefined);
    }
    if (savedNameImageKey) {
      await getStorageService()
        .delete(savedNameImageKey)
        .catch(() => undefined);
    }
    throw error;
  }

  if (replacedLogoKey && replacedLogoKey !== savedLogoKey) {
    await deleteSchoolAssetIfUnused(replacedLogoKey, "logoStorageKey").catch(
      (error: unknown) => {
        console.error("Failed to clean up replaced school emblem", error);
      },
    );
  }
  if (replacedNameImageKey && replacedNameImageKey !== savedNameImageKey) {
    await deleteSchoolAssetIfUnused(
      replacedNameImageKey,
      "nameImageStorageKey",
    ).catch((error: unknown) => {
      console.error("Failed to clean up replaced school name image", error);
    });
  }
  return adminSchoolView(schoolRecord);
}

async function readCurrentSchoolImage(
  userId: string,
  imageType: "logo" | "nameImage",
): Promise<{ data: Buffer; contentType: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      school: {
        select: { logoStorageKey: true, nameImageStorageKey: true },
      },
    },
  });
  if (!user) {
    throw new SchoolBindingOperationError("用户账号不存在。", 404);
  }

  const key =
    imageType === "logo"
      ? user.school?.logoStorageKey
      : user.school?.nameImageStorageKey;
  const folder = imageType === "logo" ? "school-logos" : "school-name-images";
  if (
    !key ||
    !new RegExp(`^${folder}/[0-9a-f-]+\\.(png|jpg|webp)$`).test(key)
  ) {
    return null;
  }
  const extension = key.slice(key.lastIndexOf(".") + 1);
  const contentType =
    extension === "png"
      ? "image/png"
      : extension === "jpg"
        ? "image/jpeg"
        : "image/webp";
  return { data: await getStorageService().read(key), contentType };
}

export function readCurrentSchoolLogo(userId: string) {
  return readCurrentSchoolImage(userId, "logo");
}

export function readCurrentSchoolNameImage(userId: string) {
  return readCurrentSchoolImage(userId, "nameImage");
}

async function deleteSchoolAssetIfUnused(
  key: string,
  field: "logoStorageKey" | "nameImageStorageKey",
): Promise<void> {
  const stillUsed = await prisma.school.findFirst({
    where: { [field]: key },
    select: { id: true },
  });
  if (stillUsed) return;
  await getStorageService()
    .delete(key)
    .catch((error: unknown) => {
      console.error("Failed to remove replaced school image", error);
    });
}
