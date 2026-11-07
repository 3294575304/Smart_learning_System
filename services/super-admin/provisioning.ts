import "server-only";

import { createHash } from "node:crypto";
import { AuditAction, Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import { hashPassword } from "@/services/auth/password";
import {
  writeSystemConfigAuditLog,
  writeUserAuditLog,
} from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ProvisioningError } from "@/services/super-admin/provisioning-errors";
import { adminUserIdSchema } from "@/services/admin/users/schemas";
import {
  createPartnerSchoolSchema,
  createSchoolAdminSchema,
  partnerSchoolIdSchema,
  type CreatePartnerSchoolData,
  type CreateSchoolAdminData,
  type UpdateSchoolAdminData,
} from "@/services/super-admin/provisioning-schemas";
import type {
  CreatedPartnerSchool,
  CreatedSchoolAdmin,
} from "@/services/super-admin/provisioning-types";
import { deleteSchoolAssetIfUnused } from "@/services/schools/service";

async function requireSuperAdmin(
  tx: Prisma.TransactionClient,
  actorId: string,
) {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { role: true, status: true },
  });
  if (actor?.role !== Role.SUPER_ADMIN || actor.status !== UserStatus.ACTIVE)
    throw new AuthorizationError("只有已启用的超级管理员可以执行此操作");
}

export async function deletePartnerSchool(
  actorId: string,
  rawSchoolId: string,
  context: AuditRequestContext,
): Promise<{ id: string }> {
  const schoolId = partnerSchoolIdSchema.parse(rawSchoolId);
  let deleted: {
    id: string;
    logoStorageKey: string | null;
    nameImageStorageKey: string | null;
  };
  try {
    deleted = await prisma.$transaction(async (tx) => {
      await requireSuperAdmin(tx, actorId);
      const school = await tx.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          name: true,
          provinceCode: true,
          logoStorageKey: true,
          nameImageStorageKey: true,
        },
      });
      if (!school) throw new ResourceNotFoundError("学校不存在或已删除");
      const unboundByRole = await tx.user.groupBy({
        by: ["role"],
        where: { schoolId: school.id },
        _count: { _all: true },
      });
      const detachedCounts = Object.fromEntries(
        unboundByRole.map(({ role, _count }) => [role, _count._all]),
      );
      // Preserve catalog rows and historical course references while removing
      // the school tenant. Deactivate the rows so private catalogs do not become
      // available as shared legacy options to other schools.
      await tx.courseTemplate.updateMany({
        where: { schoolId: school.id },
        data: { schoolId: null, isActive: false },
      });
      await tx.questionCourseCategory.updateMany({
        where: { schoolId: school.id },
        data: { schoolId: null, isActive: false },
      });
      const detachedUsers = await tx.user.findMany({
        where: { schoolId: school.id },
        select: { id: true },
      });
      const detachedUserIds = detachedUsers.map(({ id }) => id);
      await tx.user.updateMany({
        where: { schoolId: school.id },
        data: { schoolId: null, status: UserStatus.INACTIVE },
      });
      if (detachedUserIds.length > 0) {
        await tx.authSession.deleteMany({
          where: { userId: { in: detachedUserIds } },
        });
      }
      await tx.school.delete({ where: { id: school.id } });
      await writeSystemConfigAuditLog(tx, {
        actorId,
        action: AuditAction.SYSTEM_CONFIG_UPDATED,
        targetId: school.id,
        summary: `解除合作关系：${school.name}`,
        beforeData: {
          schoolId: school.id,
          schoolName: school.name,
          provinceCode: school.provinceCode,
        },
        afterData: { deleted: true, detachedCounts },
        context,
      });
      return school;
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    )
      throw new ProvisioningError(
        "学校关联数据已发生变化，无法解除关系，请刷新后重试",
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      throw new ResourceNotFoundError("学校不存在或已删除");
    throw error;
  }
  const cleanup = await Promise.allSettled([
    ...(deleted.logoStorageKey
      ? [deleteSchoolAssetIfUnused(deleted.logoStorageKey, "logoStorageKey")]
      : []),
    ...(deleted.nameImageStorageKey
      ? [
          deleteSchoolAssetIfUnused(
            deleted.nameImageStorageKey,
            "nameImageStorageKey",
          ),
        ]
      : []),
  ]);
  if (cleanup.some((result) => result.status === "rejected"))
    console.error("School deletion succeeded but unused asset cleanup failed");
  return { id: deleted.id };
}

export async function createPartnerSchool(
  actorId: string,
  input: CreatePartnerSchoolData,
  context: AuditRequestContext,
): Promise<CreatedPartnerSchool> {
  const data = createPartnerSchoolSchema.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await requireSuperAdmin(tx, actorId);
      const existing = await tx.school.findFirst({
        where: { name: { equals: data.name, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing)
        throw new ProvisioningError("该学校已存在，请直接为其创建管理员");
      const key = `school_${createHash("sha256").update(data.name.toLocaleLowerCase("zh-CN")).digest("hex")}`;
      const school = await tx.school.create({
        data: { key, name: data.name, provinceCode: data.provinceCode },
        select: { id: true, name: true, provinceCode: true },
      });
      await writeSystemConfigAuditLog(tx, {
        actorId,
        action: AuditAction.SYSTEM_CONFIG_UPDATED,
        targetId: school.id,
        summary: `添加合作学校：${school.name}`,
        beforeData: {},
        afterData: {
          schoolId: school.id,
          schoolName: school.name,
          provinceCode: school.provinceCode,
        },
        context,
      });
      return school;
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ProvisioningError("该学校已存在，请刷新学校目录");
    throw error;
  }
}

export async function createSchoolAdmin(
  actorId: string,
  input: CreateSchoolAdminData,
  context: AuditRequestContext,
): Promise<CreatedSchoolAdmin> {
  const data = createSchoolAdminSchema.parse(input);
  // Verify the actor before spending time hashing an untrusted request.
  await requireSuperAdmin(prisma, actorId);
  const passwordHash = await hashPassword(data.password);
  try {
    return await prisma.$transaction(async (tx) => {
      await requireSuperAdmin(tx, actorId);
      const school = await tx.school.findUnique({
        where: { id: data.schoolId },
        select: { id: true, name: true },
      });
      if (!school)
        throw new ResourceNotFoundError("所选合作学校不存在，请重新选择");
      const existing = await tx.user.findFirst({
        where: { email: { equals: data.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing)
        throw new ProvisioningError("该邮箱已被使用，请使用其他邮箱");
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
          schoolId: school.id,
          mustChangePassword: true,
          profile: { create: { displayName: data.displayName } },
        },
        select: { id: true },
      });
      await writeUserAuditLog(tx, {
        actorId,
        action: AuditAction.USER_CREATED,
        targetId: user.id,
        summary: `为${school.name}创建高校管理员：${data.displayName}`,
        beforeData: null,
        afterData: {
          displayName: data.displayName,
          email: data.email,
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
        },
        context,
      });
      await writeSystemConfigAuditLog(tx, {
        actorId,
        action: AuditAction.SYSTEM_CONFIG_UPDATED,
        targetId: school.id,
        summary: `绑定高校管理员：${data.displayName} → ${school.name}`,
        beforeData: {},
        afterData: {
          schoolId: school.id,
          schoolName: school.name,
          adminId: user.id,
        },
        context,
      });
      return {
        id: user.id,
        email: data.email,
        displayName: data.displayName,
        school,
      };
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ProvisioningError("该邮箱已被使用，请使用其他邮箱");
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    )
      throw new ProvisioningError("学校信息已发生变化，请刷新后重新选择");
    throw error;
  }
}

export async function deleteSchoolAdmin(
  actorId: string,
  rawAdminId: string,
  context: AuditRequestContext,
): Promise<{ id: string }> {
  await requireSuperAdmin(prisma, actorId);
  const parsedId = adminUserIdSchema.safeParse(rawAdminId);
  if (!parsedId.success) throw new ProvisioningError("管理员 ID 格式无效");
  return prisma.$transaction(async (tx) => {
    await requireSuperAdmin(tx, actorId);
    const before = await tx.user.findFirst({
      where: { id: parsedId.data, role: Role.ADMIN, deletedAt: null },
      select: {
        id: true,
        email: true,
        status: true,
        schoolId: true,
        profile: { select: { displayName: true } },
      },
    });
    if (!before) throw new ResourceNotFoundError("高校管理员不存在");
    const deletedAt = new Date();
    const removed = await tx.user.updateMany({
      where: { id: before.id, role: Role.ADMIN, deletedAt: null },
      data: { status: UserStatus.INACTIVE, deletedAt, email: null },
    });
    if (removed.count !== 1)
      throw new ResourceNotFoundError("高校管理员不存在");
    await tx.authSession.deleteMany({ where: { userId: before.id } });
    await writeUserAuditLog(tx, {
      actorId,
      action: AuditAction.USER_DISABLED,
      targetId: before.id,
      summary: `删除高校管理员账号：${before.profile?.displayName ?? before.email ?? before.id}`,
      beforeData: {
        displayName: before.profile?.displayName ?? null,
        email: before.email,
        role: Role.ADMIN,
        status: before.status,
      },
      afterData: {
        displayName: before.profile?.displayName ?? null,
        email: null,
        role: Role.ADMIN,
        status: UserStatus.INACTIVE,
      },
      context,
    });
    return { id: before.id };
  });
}

export async function updateSchoolAdmin(
  actorId: string,
  adminId: string,
  input: UpdateSchoolAdminData,
  context: AuditRequestContext,
): Promise<{ id: string; email: string; displayName: string }> {
  await requireSuperAdmin(prisma, actorId);
  const passwordHash = input.password
    ? await hashPassword(input.password)
    : undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      await requireSuperAdmin(tx, actorId);
      const before = await tx.user.findFirst({
        where: { id: adminId, role: Role.ADMIN, deletedAt: null },
        select: {
          id: true,
          email: true,
          status: true,
          profile: { select: { displayName: true } },
        },
      });
      if (!before) throw new ResourceNotFoundError("高校管理员不存在");
      const displayName = input.displayName;
      const email = input.email;
      const updated = await tx.user.update({
        where: { id: before.id },
        data: {
          email,
          ...(passwordHash
            ? { passwordHash, mustChangePassword: true }
            : {}),
          profile: {
            upsert: {
              create: { displayName },
              update: { displayName },
            },
          },
        },
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true } },
        },
      });
      if (passwordHash)
        await tx.authSession.deleteMany({ where: { userId: before.id } });
      await writeUserAuditLog(tx, {
        actorId,
        action: AuditAction.USER_UPDATED,
        targetId: before.id,
        summary: passwordHash
          ? `更新高校管理员账号并重置密码：${displayName}（${email}）`
          : `更新高校管理员账号：${displayName}（${email}）`,
        beforeData: {
          displayName: before.profile?.displayName ?? before.email,
          email: before.email,
          role: Role.ADMIN,
          status: before.status,
        },
        afterData: {
          displayName,
          email,
          role: Role.ADMIN,
          status: before.status,
        },
        context,
      });
      return {
        id: updated.id,
        email: updated.email ?? email,
        displayName: updated.profile?.displayName ?? displayName,
      };
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ProvisioningError("该邮箱已被其他用户使用");
    throw error;
  }
}
