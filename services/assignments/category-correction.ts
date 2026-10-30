import "server-only";
import { z } from "zod";
import { assignmentCategorySchema } from "./category";
import { runAssignmentSerializable } from "./transactions";
import { lockAssignmentLifecycle } from "./lifecycle-lock";
import { AssignmentOperationError } from "./errors";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
export const categoryCorrectionSchema = z
  .object({
    category: assignmentCategorySchema,
    expectedCategory: assignmentCategorySchema,
    reason: z.string().trim().min(2).max(500),
  })
  .strict();
export async function correctLegacyCategory(
  teacherId: string,
  id: string,
  input: z.infer<typeof categoryCorrectionSchema>,
  context: AuditRequestContext,
) {
  return runAssignmentSerializable(async (tx) => {
    const lifecycle = await lockAssignmentLifecycle(tx, id, teacherId);
    const assignment = await tx.assignment.findUniqueOrThrow({ where: { id } });
    if (["ARCHIVED", "REVOKED"].includes(lifecycle.status))
      throw new AssignmentOperationError("当前作业只读，无法修正类别", 409);
    if (!assignment.categoryNeedsReview) {
      if (assignment.category === input.category)
        return { category: assignment.category };
      throw new AssignmentOperationError(
        "类别已确认或已被冻结，请刷新核对",
        409,
      );
    }
    if (assignment.category !== input.expectedCategory)
      throw new AssignmentOperationError(
        "类别已被其他操作修改，请刷新后重试",
        409,
      );
    await tx.assignment.update({
      where: { id },
      data: { category: input.category, categoryNeedsReview: false },
    });
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: "ASSIGNMENT_CATEGORY_CORRECTED",
      targetType: "ASSIGNMENT",
      targetId: id,
      summary: "确认历史作业类别；保留原台账关联",
      beforeData: { category: assignment.category },
      afterData: { category: input.category, reason: input.reason },
      context,
    });
    return { category: input.category };
  }, "类别已被其他操作更新，请刷新后重试");
}
