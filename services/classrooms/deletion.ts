import "server-only";
import { createHash } from "node:crypto";
import { AuditAction, AuditTargetType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { runClassroomSerializable } from "./transactions";
import { EFFECTIVE_SUBMISSION_STATUSES } from "@/services/assignments/reporting";
import { createNotifications } from "@/services/notifications/service";
import { ClassroomOperationError } from "./errors";
import { deleteClassroomSchema } from "./schemas";

type Database = Prisma.TransactionClient | typeof prisma;

async function readPreview(
  db: Database,
  teacherId: string,
  classroomId: string,
) {
  const classroom = await db.classroom.findFirst({
    where: {
      id: classroomId,
      teacherId,
      teacher: { role: "TEACHER", status: "ACTIVE" },
    },
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      course: { select: { name: true } },
      _count: {
        select: {
          memberships: true,
          assignments: true,
          studentIdentityAssignments: true,
          attendanceSessions: true,
          courseSurveys: true,
          gradebooks: true,
          courseFileVersions: true,
          studentImportBatches: true,
          aiAnalyses: true,
          qualityReports: true,
          gradeImportBatches: true,
          outcomeAttainmentRuns: true,
          recommendationCycles: true,
          teachingProgressRevisions: true,
          announcements: true,
        },
      },
    },
  });
  if (!classroom) throw new ResourceNotFoundError("班级不存在");
  const [members, pending, submissions, exams, importing, judging] =
    await Promise.all([
      db.classMembership.count({ where: { classroomId, status: "ACTIVE" } }),
      db.studentIdentityClassroomAssignment.count({
        where: {
          classroomId,
          withdrawnAt: null,
          studentIdentity: { status: "PENDING", userId: null },
        },
      }),
      db.submission.findMany({
        where: {
          assignment: {
            classroomId,
            deletedAt: null,
            status: { in: ["PUBLISHED", "CLOSED"] },
          },
          student: {
            classMemberships: { some: { classroomId, status: "ACTIVE" } },
          },
          status: { in: EFFECTIVE_SUBMISSION_STATUSES },
        },
        distinct: ["assignmentId", "studentId"],
        orderBy: [
          { assignmentId: "asc" },
          { studentId: "asc" },
          { attemptNumber: "desc" },
          { submittedAt: "desc" },
          { id: "desc" },
        ],
        select: {
          id: true,
          status: true,
          publishedAt: true,
          score: true,
          maxScore: true,
        },
      }),
      db.assignment.count({
        where: {
          classroomId,
          examSession: { cancelledAt: null, endsAt: { gt: new Date() } },
        },
      }),
      db.studentImportBatch.count({
        where: { classroomId, status: "PROCESSING" },
      }),
      db.programmingAttempt.count({
        where: {
          assignmentQuestion: { assignment: { classroomId } },
          status: { in: ["PENDING", "RUNNING"] },
        },
      }),
    ]);
  const unfinished = submissions.filter(
    (s) =>
      !["GRADED", "PUBLISHED"].includes(s.status) ||
      s.score === null ||
      s.maxScore === null ||
      (s.status !== "PUBLISHED" && s.publishedAt === null),
  ).length;
  const hasHistory = Object.values(classroom._count).some((count) => count > 0);
  const blockedReason =
    classroom.status === "ARCHIVED"
      ? "班级已删除或归档"
      : classroom.status === "ACTIVE" && hasHistory
        ? "班级已有成员或教学记录，请先在班级详情确认结课，再删除。"
        : importing
          ? "名单正在导入，请等待导入完成后重试。"
          : exams
            ? "班级仍有关联的未结束考试，请先处理考试安排。"
            : judging
              ? "班级仍有正在判题或运行的任务，请处理完成后重试。"
              : unfinished
                ? `仍有 ${unfinished} 份最新作答待批改或成绩未公布，请处理完成后再删除。`
                : null;
  const token = createHash("sha256")
    .update(
      JSON.stringify({
        id: classroom.id,
        name: classroom.name,
        status: classroom.status,
        updatedAt: classroom.updatedAt.toISOString(),
        counts: classroom._count,
        members,
        pending,
        submissions: submissions.map((s) => [
          s.id,
          s.status,
          s.publishedAt,
          s.score?.toString(),
          s.maxScore?.toString(),
        ]),
        exams,
        importing,
        judging,
      }),
    )
    .digest("hex");
  return {
    id: classroom.id,
    name: classroom.name,
    status: classroom.status,
    courseName: classroom.course?.name ?? null,
    memberCount: members,
    pendingCount: pending,
    assignmentCount: classroom._count.assignments,
    teachingRecordCount: Object.entries(classroom._count)
      .filter(
        ([key]) =>
          ![
            "memberships",
            "studentIdentityAssignments",
            "assignments",
          ].includes(key),
      )
      .reduce((sum, [, count]) => sum + count, 0),
    blockedReason,
    token,
  };
}

export async function getTeacherClassroomDeletionPreview(
  teacherId: string,
  classroomId: string,
) {
  const preview = await readPreview(prisma, teacherId, classroomId);
  if (preview.status === "ARCHIVED")
    throw new ResourceNotFoundError("班级不存在或已删除");
  return preview;
}
export type ClassroomDeletionPreview = Awaited<
  ReturnType<typeof getTeacherClassroomDeletionPreview>
>;

export async function deleteTeacherClassroom(
  teacherId: string,
  classroomId: string,
  raw: unknown,
  context: AuditRequestContext,
  dependencies: { writeAuditLog?: typeof writeGovernanceAuditLog } = {},
) {
  const input = deleteClassroomSchema.parse(raw);
  return runClassroomSerializable(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Classroom" WHERE id = ${classroomId} AND "teacherId" = ${teacherId} FOR UPDATE`;
      const preview = await readPreview(tx, teacherId, classroomId);
      if (preview.status === "ARCHIVED") {
        const prior = await tx.auditLog.findFirst({
          where: {
            actorId: teacherId,
            targetId: classroomId,
            action: "CLASSROOM_DISSOLVED",
            afterData: { path: ["operation"], equals: "DELETE_CLASSROOM" },
          },
          select: { id: true },
        });
        if (prior) return { id: classroomId, alreadyDeleted: true };
      }
      if (preview.blockedReason)
        throw new ClassroomOperationError(preview.blockedReason);
      if (preview.token !== input.token || preview.name !== input.confirmedName)
        throw new ClassroomOperationError(
          "班级或关联数据已变化，请重新加载删除确认后重试。",
        );
      await tx.$queryRaw`SELECT id FROM "StudentImportBatch" WHERE "classroomId" = ${classroomId} FOR UPDATE`;
      const now = new Date();
      const members = await tx.classMembership.findMany({
        where: { classroomId, status: "ACTIVE" },
        select: { studentId: true },
      });
      // Archive the class and deactivate access; preserve every original row and teaching snapshot.
      await tx.classroom.update({
        where: { id: classroomId },
        data: {
          status: "ARCHIVED",
          dissolvedAt: now,
          dissolutionReason: input.reason || "教师删除班级",
          joinCodeExpiresAt: now,
        },
      });
      await tx.classMembership.updateMany({
        where: { classroomId, status: "ACTIVE" },
        data: { status: "REMOVED", endedAt: now },
      });
      await tx.studentIdentityClassroomAssignment.updateMany({
        where: { classroomId, withdrawnAt: null },
        data: { withdrawnAt: now },
      });
      await tx.studentImportBatch.updateMany({
        where: {
          classroomId,
          status: { in: ["UPLOADED", "PREVIEW_READY", "CONFIRMED"] },
        },
        data: { status: "CANCELLED", completedAt: now },
      });
      await tx.assignmentMakeupGrant.updateMany({
        where: { assignment: { classroomId }, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: now },
      });
      await createNotifications(
        members.map(({ studentId }) => ({
          recipientId: studentId,
          type: "CLASSROOM_DISSOLVED" as const,
          priority: "IMPORTANT" as const,
          title: "班级已删除",
          content: `班级《${preview.name}》已由教师删除，已停止本班访问。历史名单、作答与成绩记录保留。`,
          sourceType: "CLASSROOM" as const,
          sourceId: classroomId,
          actionUrl: "/notifications",
          deduplicationKey: `classroom-deleted:${classroomId}`,
          expiresAt: null,
        })),
        tx,
      );
      await (dependencies.writeAuditLog ?? writeGovernanceAuditLog)(tx, {
        actorId: teacherId,
        action: AuditAction.CLASSROOM_DISSOLVED,
        targetType: AuditTargetType.CLASSROOM,
        targetId: classroomId,
        summary: `教师删除班级：${preview.name}`,
        beforeData: {
          status: preview.status,
          memberCount: preview.memberCount,
          pendingCount: preview.pendingCount,
          assignmentCount: preview.assignmentCount,
        },
        afterData: {
          operation: "DELETE_CLASSROOM",
          status: "ARCHIVED",
          deletedAt: now.toISOString(),
          reason: input.reason,
        },
        context,
      });
      return { id: classroomId, alreadyDeleted: false };
    },
    "班级状态已变化，请重新加载确认信息后重试。",
    30_000,
  );
}
