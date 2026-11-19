import "server-only";

import { listPublishedExamScores } from "@/services/course-analytics/exam-scores";
import type { ExamLedgerEntry } from "./exam-state";

/**
 * 读取学生在当前已公布修订中的考试登记状态。
 *
 * 台账只有在教学班存在 `currentPublicationId` 时才可读，也就是说：
 * 成绩公布之前拿不到教师的缺考/缓考登记，文案必须保持中性。
 */
export async function loadStudentExamLedger(
  studentId: string,
  classroomIds: readonly string[],
  now = new Date(),
) {
  const unique = [...new Set(classroomIds.filter(Boolean))];
  const ledger = new Map<string, ExamLedgerEntry>();
  if (!unique.length) return ledger;
  const rows = await listPublishedExamScores(unique, studentId, now);
  for (const row of rows) {
    if (!row.assignmentId) continue;
    const current = ledger.get(row.assignmentId);
    if (!current) {
      ledger.set(row.assignmentId, {
        status: row.status,
        score: row.score,
        maxScore: row.maxScore,
      });
      continue;
    }
    // 同一考试可能落在多个成绩项上，优先保留真正计分的那条。
    if (current.status !== "SCORED" && row.status === "SCORED")
      ledger.set(row.assignmentId, {
        status: row.status,
        score: row.score,
        maxScore: row.maxScore,
      });
  }
  return ledger;
}
