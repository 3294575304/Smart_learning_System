import "server-only";
import { z } from "zod";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { recalculateStudentCourseConceptMastery } from "@/services/concept-mastery/service";
import { createNotifications } from "@/services/notifications/service";
import { cancelAssignmentProgrammingJobs } from "@/services/programming-attempts/cancel-assignment";
import { canRevokeAssignment } from "./draft-action";
import { AssignmentOperationError } from "./errors";
import { lockAssignmentLifecycle } from "./lifecycle-lock";
import { runAssignmentSerializable } from "./transactions";
import { publishedResultsWhere } from "./work-access";

export const revokeAssignmentSchema = z
  .object({
    action: z.literal("REVOKE"),
    expectedUpdatedAt: z.string().datetime(),
    reason: z.string().trim().max(500).default(""),
  })
  .strict();

export const copyRevokedAssignmentSchema = z
  .object({
    action: z.literal("COPY_REVOKED"),
    requestId: z.string().uuid(),
  })
  .strict();

export function revokeAssignment(
  teacherId: string,
  assignmentId: string,
  input: z.infer<typeof revokeAssignmentSchema>,
  context: AuditRequestContext,
) {
  return runAssignmentSerializable(
    async (tx) => {
      const assignment = await lockAssignmentLifecycle(
        tx,
        assignmentId,
        teacherId,
      );
      if (assignment.status === "REVOKED") return { action: input.action };
      if (assignment.updatedAt.toISOString() !== input.expectedUpdatedAt)
        throw new AssignmentOperationError("作业状态已变化，请刷新后重试");
      if (!canRevokeAssignment(assignment))
        throw new AssignmentOperationError("仅可撤销已开放且未归档的作业");
      const info = await tx.assignment.findUniqueOrThrow({
        where: { id: assignmentId },
        select: {
          title: true,
          classroom: {
            select: {
              courseId: true,
              name: true,
              memberships: {
                where: {
                  status: "ACTIVE",
                  student: { role: "STUDENT", status: "ACTIVE" },
                },
                select: { studentId: true },
              },
            },
          },
          _count: {
            select: {
              submissions: { where: publishedResultsWhere },
              gradeItems: true,
              sourceGradeRevisions: true,
            },
          },
        },
      });
      if (
        info._count.submissions ||
        info._count.gradeItems ||
        info._count.sourceGradeRevisions
      )
        throw new AssignmentOperationError(
          "已有成绩公布或台账关联，不能撤销作业",
        );
      const now = new Date();
      // 撤销保留记录：作业转入历史分区（status=REVOKED），教师仍可查看并
      // 通过 COPY_REVOKED 复制为草稿重发；不置 deletedAt，否则详情页 404，
      // 历史列表与复制入口都会不可达。学生端按 status 拒绝作答并提示「已撤销」。
      await tx.assignment.update({
        where: { id: assignmentId },
        data: { status: "REVOKED" },
      });
      await tx.assignmentMakeupGrant.updateMany({
        where: { assignmentId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: now },
      });
      await cancelAssignmentProgrammingJobs(tx, assignmentId, now);

      const notified = await tx.notification.findMany({
        where: {
          sourceType: "ASSIGNMENT",
          sourceId: assignmentId,
          type: "ASSIGNMENT_PUBLISHED",
        },
        select: { recipientId: true },
        distinct: ["recipientId"],
      });
      const recipients = new Set([
        ...info.classroom.memberships.map((row) => row.studentId),
        ...notified.map((row) => row.recipientId),
      ]);
      await tx.notification.updateMany({
        where: {
          sourceType: "ASSIGNMENT",
          sourceId: assignmentId,
          type: { in: ["ASSIGNMENT_PUBLISHED", "ASSIGNMENT_DUE_SOON"] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { expiresAt: now },
      });
      await createNotifications(
        [...recipients].map((recipientId) => ({
          recipientId,
          type: "ASSIGNMENT_REVOKED" as const,
          title: "作业已撤销",
          content: `「${info.classroom.name}」的「${info.title}」已撤销，无需提交，也不会计为缺交。`,
          priority: "IMPORTANT" as const,
          actionUrl: "/student/assignments",
          sourceType: "ASSIGNMENT" as const,
          sourceId: assignmentId,
          deduplicationKey: `assignment-revoked:${assignmentId}`,
          expiresAt: null,
        })),
        tx,
      );
      await writeTeachingAuditLog(tx, {
        actorId: teacherId,
        action: "ASSIGNMENT_REVOKED",
        targetType: "ASSIGNMENT",
        targetId: assignmentId,
        summary: "撤销误发作业",
        beforeData: {
          status: assignment.status,
          classroomId: assignment.classroom.id,
        },
        afterData: {
          status: "REVOKED",
          reason: input.reason,
          revokedAt: now.toISOString(),
        },
        context,
      });
      const courseId = info.classroom.courseId;
      if (courseId) {
        const affected = await tx.studentAnswerConceptEvidence.findMany({
          where: { assignmentId, courseId },
          distinct: ["studentId"],
          select: { studentId: true },
          orderBy: { studentId: "asc" },
        });
        for (const { studentId } of affected)
          await recalculateStudentCourseConceptMastery(tx, studentId, courseId);
      }
      return { action: input.action };
    },
    "作业状态已变化，请刷新后重试",
    60_000,
  );
}
