import { formatNotificationTime } from "@/services/notifications/templates";
import "server-only";
import { prisma } from "@/lib/prisma";
import { AuditAction, AuditTargetType, type Prisma } from "@prisma/client";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { createNotifications } from "@/services/notifications/service";
import { AssignmentOperationError } from "./errors";
import {
  lockAssignmentLifecycle,
  touchAssignmentLifecycle,
} from "./lifecycle-lock";
import { publishedResultsWhere } from "./work-access";
import {
  extendAssignmentSchema,
  issueMakeupSchema,
  revokeMakeupSchema,
} from "./makeup-schemas";
import { runAssignmentSerializable } from "./transactions";

async function editable(
  tx: Prisma.TransactionClient,
  teacherId: string,
  assignmentId: string,
) {
  const assignment = await lockAssignmentLifecycle(tx, assignmentId, teacherId);
  if (
    assignment.status !== "PUBLISHED" ||
    assignment.classroom.status !== "ACTIVE"
  )
    throw new AssignmentOperationError(
      "仅授课中班级的已发布作业可延期或开放补交",
      409,
    );
  if (
    !assignment.publishedAt ||
    assignment.publishedAt > new Date() ||
    !assignment.dueAt
  )
    throw new AssignmentOperationError("作业尚未开放或缺少截止时间", 409);
  if (
    await tx.submission.count({
      where: { assignmentId, ...publishedResultsWhere },
    })
  )
    throw new AssignmentOperationError(
      "成绩及答案已经公布，不能延期或开放补交",
      409,
    );
  return assignment;
}
async function notify(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  recipients: string[],
  title: string,
  content: string,
  key: string,
  expiresAt: Date | null,
) {
  return createNotifications(
    recipients.map((recipientId) => ({
      recipientId,
      type: "ASSIGNMENT_PUBLISHED" as const,
      title,
      content,
      priority: "IMPORTANT" as const,
      actionUrl: `/student/assignments/${assignmentId}`,
      sourceType: "ASSIGNMENT" as const,
      sourceId: assignmentId,
      deduplicationKey: key,
      expiresAt,
    })),
    tx,
  );
}
export async function extendAssignmentDeadline(
  teacherId: string,
  assignmentId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const input = extendAssignmentSchema.parse(raw);
  return runAssignmentSerializable(
    async (tx) => {
      const assignment = await editable(tx, teacherId, assignmentId);
      if (assignment.dueAt?.getTime() === input.dueAt.getTime())
        return { dueAt: input.dueAt, changed: false };
      if (
        !assignment.dueAt ||
        input.dueAt <= assignment.dueAt ||
        input.dueAt <= new Date()
      )
        throw new AssignmentOperationError(
          "新截止时间必须晚于原截止时间和当前时间",
          409,
        );
      const now = new Date();
      await tx.assignment.update({
        where: { id: assignmentId },
        data: { dueAt: input.dueAt },
      });
      await tx.notification.updateMany({
        where: {
          sourceType: "ASSIGNMENT",
          sourceId: assignmentId,
          type: "ASSIGNMENT_DUE_SOON",
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { expiresAt: now },
      });
      await tx.assignmentMakeupGrant.updateMany({
        where: {
          assignmentId,
          status: "ACTIVE",
          expiresAt: { gt: now, lt: input.dueAt },
        },
        data: { expiresAt: input.dueAt },
      });
      const members = await tx.classMembership.findMany({
        where: {
          classroomId: assignment.classroom.id,
          status: "ACTIVE",
          student: { status: "ACTIVE", role: "STUDENT" },
        },
        select: { studentId: true },
      });
      await writeTeachingAuditLog(tx, {
        actorId: teacherId,
        action: AuditAction.ASSIGNMENT_DEADLINE_EXTENDED,
        targetType: AuditTargetType.ASSIGNMENT,
        targetId: assignmentId,
        summary: "延长本班作业截止时间",
        beforeData: { dueAt: assignment.dueAt.toISOString() },
        afterData: {
          dueAt: input.dueAt.toISOString(),
          reason: input.reason,
          requestId: input.requestId,
        },
        context,
      });
      await notify(
        tx,
        assignmentId,
        members.map((m) => m.studentId),
        "作业截止时间已延长",
        `教师已将本班作业截止时间延长至 ${formatNotificationTime(input.dueAt)}。请进入作业查看。`,
        `deadline:${assignmentId}:${input.dueAt.toISOString()}`,
        input.dueAt,
      );
      return { dueAt: input.dueAt, changed: true };
    },
    "延期操作发生并发冲突，请刷新后重试",
    30000,
  );
}
export async function issueAssignmentMakeup(
  teacherId: string,
  assignmentId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const input = issueMakeupSchema.parse(raw);
  return runAssignmentSerializable(
    async (tx) => {
      await lockAssignmentLifecycle(tx, assignmentId, teacherId);
      const existing = await tx.assignmentMakeupGrant.findMany({
        where: { assignmentId, requestId: input.requestId },
      });
      if (existing.length) {
        if (
          existing.length !== input.studentIds.length ||
          existing.some(
            (g) =>
              !input.studentIds.includes(g.studentId) ||
              g.reason !== input.reason ||
              g.requestedExpiresAt.getTime() !== input.expiresAt.getTime(),
          )
        )
          throw new AssignmentOperationError("同一请求不能更改授权内容", 409);
        return { grants: existing, reused: true };
      }
      const assignment = await editable(tx, teacherId, assignmentId);
      const now = new Date();
      if (!assignment.dueAt || assignment.dueAt > now)
        throw new AssignmentOperationError(
          "个人补交或重做仅在作业截止后授权",
          409,
        );
      if (input.expiresAt <= now)
        throw new AssignmentOperationError("补交截止时间必须晚于当前时间", 409);
      const members = await tx.classMembership.findMany({
        where: {
          classroomId: assignment.classroom.id,
          studentId: { in: input.studentIds },
          status: "ACTIVE",
          student: { role: "STUDENT", status: "ACTIVE" },
        },
        select: { studentId: true },
      });
      if (members.length !== input.studentIds.length)
        throw new ResourceNotFoundError("所选学生不存在或不属于当前有效成员");
      await tx.assignmentMakeupGrant.updateMany({
        where: { assignmentId, status: "ACTIVE", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      if (
        await tx.assignmentMakeupGrant.count({
          where: {
            assignmentId,
            studentId: { in: input.studentIds },
            status: "ACTIVE",
          },
        })
      )
        throw new AssignmentOperationError(
          "所选学生已有有效授权，请先撤销或等待到期",
          409,
        );
      const submitted = await tx.submission.findMany({
        where: {
          assignmentId,
          studentId: { in: input.studentIds },
          status: {
            in: ["SUBMITTED", "PENDING_REVIEW", "GRADED", "PUBLISHED"],
          },
        },
        select: { studentId: true },
      });
      const studentsWithWork = new Set(submitted.map((s) => s.studentId));
      const grants = [];
      for (const studentId of input.studentIds) {
        const grant = await tx.assignmentMakeupGrant.create({
          data: {
            assignmentId,
            studentId,
            createdById: teacherId,
            requestId: input.requestId,
            kind: studentsWithWork.has(studentId) ? "REDO" : "MAKEUP",
            reason: input.reason,
            originalDueAt: assignment.dueAt,
            requestedExpiresAt: input.expiresAt,
            expiresAt: input.expiresAt,
          },
        });
        grants.push(grant);
        await notify(
          tx,
          assignmentId,
          [studentId],
          grant.kind === "REDO" ? "作业重做已开放" : "作业补交已开放",
          `教师授权一次${grant.kind === "REDO" ? "重做" : "补交"}，截止 ${formatNotificationTime(grant.expiresAt)}；正式提交前可继续保存草稿。`,
          `makeup:${grant.id}`,
          grant.expiresAt,
        );
      }
      await touchAssignmentLifecycle(tx, assignmentId);
      await writeTeachingAuditLog(tx, {
        actorId: teacherId,
        action: AuditAction.ASSIGNMENT_MAKEUP_GRANTED,
        beforeData: null,
        targetType: AuditTargetType.ASSIGNMENT,
        targetId: assignmentId,
        summary: `开放${grants.length}名学生的一次性补交或重做`,
        afterData: {
          grantIds: grants.map((g) => g.id),
          studentIds: input.studentIds,
          expiresAt: input.expiresAt.toISOString(),
          reason: input.reason,
        },
        context,
      });
      return { grants, reused: false };
    },
    "授权操作发生并发冲突，请刷新后重试",
    30000,
  );
}
export async function revokeAssignmentMakeup(
  teacherId: string,
  assignmentId: string,
  grantId: string,
  raw: unknown,
  context: AuditRequestContext,
) {
  const input = revokeMakeupSchema.parse(raw);
  return runAssignmentSerializable(async (tx) => {
    const assignment = await lockAssignmentLifecycle(
      tx,
      assignmentId,
      teacherId,
    );
    if (
      assignment.status === "ARCHIVED" ||
      assignment.classroom.status === "ARCHIVED"
    )
      throw new AssignmentOperationError("归档记录只读", 409);
    const grant = await tx.assignmentMakeupGrant.findFirst({
      where: { id: grantId, assignmentId },
    });
    if (!grant) throw new ResourceNotFoundError("授权不存在");
    if (grant.status === "REVOKED") return { revoked: true };
    if (grant.status !== "ACTIVE" || grant.expiresAt <= new Date())
      throw new AssignmentOperationError("授权已使用或到期，不能撤销", 409);
    await tx.assignmentMakeupGrant.update({
      where: { id: grant.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await tx.notification.updateMany({
      where: {
        sourceType: "ASSIGNMENT",
        sourceId: assignmentId,
        type: "ASSIGNMENT_DUE_SOON",
        recipientId: grant.studentId,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date() },
    });
    await touchAssignmentLifecycle(tx, assignmentId);
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.ASSIGNMENT_MAKEUP_REVOKED,
      targetType: AuditTargetType.ASSIGNMENT,
      targetId: assignmentId,
      summary: "撤销尚未使用的补交或重做授权",
      beforeData: { grantId, status: grant.status },
      afterData: { status: "REVOKED", reason: input.reason },
      context,
    });
    await notify(
      tx,
      assignmentId,
      [grant.studentId],
      "作业补交授权已撤销",
      "教师已撤销本次补交或重做授权，草稿仍保留。",
      `makeup-revoked:${grant.id}`,
      null,
    );
    return { revoked: true };
  }, "撤销操作发生并发冲突，请重试");
}
export async function getAssignmentMakeupManagement(
  teacherId: string,
  assignmentId: string,
) {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, teacherId },
    select: {
      id: true,
      status: true,
      dueAt: true,
      publishedAt: true,
      classroom: {
        select: {
          status: true,
          memberships: {
            where: {
              status: "ACTIVE",
              student: { status: "ACTIVE", role: "STUDENT" },
            },
            select: {
              studentId: true,
              student: {
                select: {
                  profile: { select: { displayName: true, studentNo: true } },
                },
              },
            },
          },
        },
      },
      _count: { select: { submissions: { where: publishedResultsWhere } } },
      makeupGrants: {
        orderBy: { createdAt: "desc" },
        include: {
          student: {
            select: {
              profile: { select: { displayName: true, studentNo: true } },
            },
          },
        },
      },
    },
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");
  return assignment;
}
