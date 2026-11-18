import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * 画像快照保留策略。
 *
 * 背景：每次评分/判题/自述变化都会生成一条新快照（且带 N 条概念明细），
 * 单名学生一个学期可能积累上百条。这些历史版本只用于「画像修订趋势」和
 * 推荐周期回溯，没必要无限保留。
 *
 * 约束：快照被 LearnerProfileConceptEntry 与 CourseRecommendationCycle
 * 以 onDelete: Restrict 引用，所以删除前必须先删概念明细，并跳过被推荐
 * 周期引用的版本（那些属于审计证据，不能丢）。
 */

export {
  SNAPSHOT_KEEP_DAYS,
  SNAPSHOT_KEEP_RECENT,
  selectSnapshotIdsToPrune,
  type SnapshotRetentionRow,
} from "./snapshot-retention-policy";

import {
  SNAPSHOT_KEEP_RECENT,
  selectSnapshotIdsToPrune,
} from "./snapshot-retention-policy";

/** 回收单个学生在某门课下的过期快照，返回删除条数。 */
export async function pruneLearnerProfileSnapshots(
  studentId: string,
  courseId: string,
): Promise<number> {
  const rows = await prisma.learnerProfileSnapshot.findMany({
    where: { studentId, courseId },
    select: { id: true, revisionNumber: true, createdAt: true },
  });
  if (rows.length <= SNAPSHOT_KEEP_RECENT) return 0;

  const referenced = await prisma.courseRecommendationCycle.findMany({
    where: { profileSnapshotId: { in: rows.map((row) => row.id) } },
    select: { profileSnapshotId: true },
    distinct: ["profileSnapshotId"],
  });
  const referencedIds = new Set(
    referenced
      .map((row) => row.profileSnapshotId)
      .filter((id): id is string => Boolean(id)),
  );
  const ids = selectSnapshotIdsToPrune(rows, referencedIds);
  if (!ids.length) return 0;

  await prisma.$transaction(async (transaction) => {
    await transaction.learnerProfileConceptEntry.deleteMany({
      where: { snapshotId: { in: ids } },
    });
    await transaction.learnerProfileSnapshot.deleteMany({
      where: { id: { in: ids } },
    });
  });
  return ids.length;
}

/**
 * 读路径用的节流调度：同一学生同一课程最多每 10 分钟回收一次。
 * 回收是纯清理，失败或漏跑都不影响画像正确性，所以不阻塞请求、也不抛错。
 */
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const lastPruneAt = new Map<string, number>();

export function scheduleSnapshotPrune(studentId: string, courseId: string) {
  const key = `${studentId}\u0000${courseId}`;
  const now = Date.now();
  if (now - (lastPruneAt.get(key) ?? 0) < PRUNE_INTERVAL_MS) return;
  lastPruneAt.set(key, now);
  void pruneLearnerProfileSnapshots(studentId, courseId).catch(() => {
    // 清理失败时允许下一轮重试，不影响当前请求。
    lastPruneAt.delete(key);
  });
}
