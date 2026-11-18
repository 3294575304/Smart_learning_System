/**
 * 快照保留策略（纯规则，无数据库依赖、无 server-only 标记）。
 * 单独成文件是为了能被单元测试直接引用。
 */

/** 每名学生每门课至少保留的最近版本数。 */
export const SNAPSHOT_KEEP_RECENT = 20;
/** 这个天数内的版本一律保留，避免刚生成的趋势曲线被自己删掉。 */
export const SNAPSHOT_KEEP_DAYS = 30;

export interface SnapshotRetentionRow {
  id: string;
  revisionNumber: number;
  createdAt: Date;
}

/**
 * 挑出可以删除的快照 id。按修订号倒序保留前 keepRecent 条；其余中，
 * 早于 cutoff 且未被外部引用（推荐周期审计证据）的才进入删除集。
 */
export function selectSnapshotIdsToPrune(
  rows: readonly SnapshotRetentionRow[],
  referencedIds: ReadonlySet<string>,
  options: {
    keepRecent?: number;
    keepDays?: number;
    now?: Date;
  } = {},
): string[] {
  const keepRecent = options.keepRecent ?? SNAPSHOT_KEEP_RECENT;
  const keepDays = options.keepDays ?? SNAPSHOT_KEEP_DAYS;
  const now = options.now ?? new Date();
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  return [...rows]
    .sort((left, right) => right.revisionNumber - left.revisionNumber)
    .filter(
      (row, index) => index >= keepRecent && row.createdAt.getTime() < cutoff,
    )
    .filter((row) => !referencedIds.has(row.id))
    .map((row) => row.id);
}
