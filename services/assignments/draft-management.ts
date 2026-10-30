import "server-only";
import { z } from "zod";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { assignmentDraftAction } from "./draft-action";
import { AssignmentOperationError } from "./errors";
import { lockAssignmentLifecycle } from "./lifecycle-lock";
import { runAssignmentSerializable } from "./transactions";

export const assignmentDraftActionSchema = z
  .object({
    action: z.enum(["DELETE_DRAFT", "CANCEL_SCHEDULE"]),
    expectedUpdatedAt: z.string().datetime(),
  })
  .strict();

export function manageAssignmentDraft(
  teacherId: string,
  assignmentId: string,
  input: z.infer<typeof assignmentDraftActionSchema>,
  context: AuditRequestContext,
) {
  return runAssignmentSerializable(async (tx) => {
    const assignment = await lockAssignmentLifecycle(
      tx,
      assignmentId,
      teacherId,
    );
    const deleting = input.action === "DELETE_DRAFT";
    if (assignment.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new AssignmentOperationError("作业状态已变化，请刷新后重试", 409);
    const related = await tx.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: {
        _count: {
          select: {
            submissions: true,
            makeupGrants: true,
            gradeItems: true,
            sourceGradeRevisions: true,
          },
        },
      },
    });
    if (Object.values(related._count).some((count) => count > 0))
      throw new AssignmentOperationError(
        "作业已有作答、补交或台账记录，无法执行此操作",
        409,
      );
    const now = new Date();
    if (assignmentDraftAction(assignment, now) !== input.action)
      throw new AssignmentOperationError(
        deleting
          ? "当前作业无法删除草稿"
          : "预约已开放或班级状态已变化，无法取消预约",
        409,
      );

    await tx.assignment.update({
      where: { id: assignmentId },
      data: deleting
        ? { deletedAt: now }
        : { status: "DRAFT", publishedAt: null },
    });
    if (!deleting) {
      await tx.notification.updateMany({
        where: {
          sourceId: assignmentId,
          sourceType: "ASSIGNMENT",
          type: { in: ["ASSIGNMENT_PUBLISHED", "ASSIGNMENT_DUE_SOON"] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { expiresAt: now },
      });
    }
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: deleting
        ? "ASSIGNMENT_DRAFT_DELETED"
        : "ASSIGNMENT_SCHEDULE_CANCELLED",
      targetType: "ASSIGNMENT",
      targetId: assignmentId,
      summary: deleting ? "删除作业草稿" : "取消作业预约并退回草稿",
      beforeData: {
        classroomId: assignment.classroom.id,
        status: assignment.status,
        publishedAt: assignment.publishedAt?.toISOString() ?? null,
      },
      afterData: deleting
        ? { deletedAt: now.toISOString() }
        : { status: "DRAFT", publishedAt: null },
      context,
    });
    return { action: input.action };
  }, "作业状态已变化，请刷新后重试");
}
