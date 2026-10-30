import "server-only";
import { Prisma } from "@prisma/client";
import { recommendationIdSchema } from "@/services/recommendations/schemas";
import { prisma } from "@/lib/prisma";
import type { AuthenticatedUser } from "@/services/auth/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { assertCanAccessRecommendation } from "@/services/recommendations/policy";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import { runPracticeSerializable } from "@/services/recommendations/transactions";
import {
  practiceManagementSchema,
  practiceManagementBatchSchema,
  type PracticeManagementView,
} from "./management-schemas";

type Row = {
  title: string | null;
  endedAt: Date | null;
  trashedAt: Date | null;
  revision: number;
};
export function managementView(row: Row | null): PracticeManagementView {
  return {
    title: row?.title ?? null,
    endedAt: row?.endedAt?.toISOString() ?? null,
    trashedAt: row?.trashedAt?.toISOString() ?? null,
    revision: row?.revision ?? 0,
  };
}

/** Every student write and lifecycle operation takes the same group lock, including legacy groups. */
async function lockGroup(
  tx: Prisma.TransactionClient,
  studentId: string,
  cycleKey: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${studentId + ":" + cycleKey},0))) AS group_lock`,
  );
  return tx.practiceSetManagement.upsert({
    where: { studentId_cycleKey: { studentId, cycleKey } },
    create: { studentId, cycleKey },
    update: {},
  });
}
export async function assertPracticeGroupWritable(
  tx: Prisma.TransactionClient,
  studentId: string,
  recommendationId: string,
) {
  const anchor = await tx.personalizedRecommendation.findFirst({
    where: { id: recommendationId, studentId },
    select: {
      cycleKey: true,
      courseCycle: {
        select: {
          classroom: {
            select: {
              status: true,
              memberships: {
                where: { studentId, status: "ACTIVE" },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  if (!anchor) throw new ResourceNotFoundError("练习组不存在");
  if (
    anchor.courseCycle &&
    (anchor.courseCycle.classroom.status !== "ACTIVE" ||
      !anchor.courseCycle.classroom.memberships.length)
  )
    throw new RecommendationOperationError(
      "当前教学班不可作答，请查看历史记录",
      409,
    );
  const row = await lockGroup(tx, studentId, anchor.cycleKey);
  if (row.endedAt || row.trashedAt)
    throw new RecommendationOperationError(
      "练习已结束或已移入回收站，只能回看记录",
      409,
    );
}
export async function readPracticeManagement(
  studentId: string,
  cycleKey: string,
) {
  return managementView(
    await prisma.practiceSetManagement.findUnique({
      where: { studentId_cycleKey: { studentId, cycleKey } },
    }),
  );
}

async function apply(
  tx: Prisma.TransactionClient,
  studentId: string,
  cycleKey: string,
  input: ReturnType<typeof practiceManagementSchema.parse>,
) {
  const row = await lockGroup(tx, studentId, cycleKey);
  const same =
    input.action === "RENAME"
      ? row.title === input.title
      : input.action === "TRASH"
        ? row.trashedAt !== null
        : input.action === "RESTORE"
          ? row.trashedAt === null
          : row.endedAt !== null;
  if (same) return managementView(row);
  if (row.revision !== input.expectedRevision)
    throw new RecommendationOperationError("练习记录已更新，请刷新后重试", 409);
  if (row.trashedAt && input.action !== "RESTORE")
    throw new RecommendationOperationError("请先恢复回收站中的练习", 409);
  if (
    input.action === "END" &&
    !(await tx.personalizedRecommendation.count({
      where: { studentId, cycleKey, status: { in: ["PENDING", "STARTED"] } },
    }))
  )
    throw new RecommendationOperationError("练习已结束，无需再次结束", 409);
  const now = new Date();
  if (input.action === "TRASH" || input.action === "END")
    await tx.personalizedRecommendation.updateMany({
      where: { studentId, cycleKey, status: { in: ["PENDING", "STARTED"] } },
      data: { status: "DISMISSED", dismissedAt: now },
    });
  const updated = await tx.practiceSetManagement.update({
    where: { id: row.id },
    data: {
      revision: { increment: 1 },
      ...(input.action === "RENAME"
        ? { title: input.title }
        : input.action === "RESTORE"
          ? { trashedAt: null }
          : input.action === "TRASH"
            ? { trashedAt: now, endedAt: row.endedAt ?? now }
            : { endedAt: row.endedAt ?? now }),
    },
  });
  return managementView(updated);
}
export async function managePracticeSet(
  actor: AuthenticatedUser,
  id: string,
  raw: unknown,
) {
  assertCanAccessRecommendation(actor, actor.id);
  const input = practiceManagementSchema.parse(raw);
  const targetId = recommendationIdSchema.parse(id);
  return runPracticeSerializable(async (tx) => {
    const anchor = await tx.personalizedRecommendation.findFirst({
      where: { id: targetId, studentId: actor.id },
      select: { cycleKey: true },
    });
    if (!anchor) throw new ResourceNotFoundError("练习组不存在");
    return apply(tx, actor.id, anchor.cycleKey, input);
  });
}
export async function managePracticeSets(
  actor: AuthenticatedUser,
  raw: unknown,
) {
  assertCanAccessRecommendation(actor, actor.id);
  const input = practiceManagementBatchSchema.parse(raw);
  if (new Set(input.items.map((item) => item.id)).size !== input.items.length)
    throw new RecommendationOperationError("不能重复选择练习组", 400);
  return runPracticeSerializable(async (tx) => {
    const anchors = await tx.personalizedRecommendation.findMany({
      where: {
        id: { in: input.items.map((item) => item.id) },
        studentId: actor.id,
      },
      select: { id: true, cycleKey: true },
    });
    if (anchors.length !== input.items.length)
      throw new ResourceNotFoundError("练习组不存在");
    if (new Set(anchors.map((item) => item.cycleKey)).size !== anchors.length)
      throw new RecommendationOperationError("同一练习组不能重复选择", 400);
    const result = [];
    for (const anchor of anchors.sort((a, b) =>
      a.cycleKey.localeCompare(b.cycleKey),
    )) {
      const item = input.items.find((item) => item.id === anchor.id);
      if (!item) throw new ResourceNotFoundError("练习组不存在");
      result.push({
        id: anchor.id,
        management: await apply(tx, actor.id, anchor.cycleKey, {
          action: input.action,
          expectedRevision: item.expectedRevision,
        }),
      });
    }
    return { items: result };
  });
}
