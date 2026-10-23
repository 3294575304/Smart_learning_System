import { assertClassroomWorkAllowed } from "./classroom-work";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  AuditAction,
  AuditTargetType,
  Prisma,
  Role,
  SubmissionStatus,
} from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import type { AuthenticatedUser } from "@/services/auth/types";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { assertAssignmentAcceptsWork } from "@/services/assignments/policy";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { getStorageService } from "@/services/storage";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";

async function access(
  tx: Prisma.TransactionClient,
  actor: AuthenticatedUser,
  submissionId: string,
  edit = false,
) {
  const submission = await tx.submission.findFirst({
    where: {
      id: submissionId,
      ...(actor.role === Role.STUDENT
        ? { studentId: actor.id }
        : { assignment: { teacherId: actor.id } }),
    },
    include: {
      assignment: {
        include: {
          classroom: {
            select: {
              status: true,
              memberships: {
                where: { studentId: actor.id, status: "ACTIVE" },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  if (
    !submission ||
    (actor.role !== Role.STUDENT && actor.role !== Role.TEACHER) ||
    (actor.role === Role.STUDENT &&
      !submission.assignment.classroom.memberships.length)
  )
    throw new ResourceNotFoundError("作答记录不存在");
  if (edit) {
    if (
      actor.role !== Role.STUDENT ||
      submission.status !== SubmissionStatus.IN_PROGRESS
    )
      throw new AssignmentOperationError("已提交作答不能修改附件", 409);
    assertAssignmentAcceptsWork(submission.assignment, new Date());
    await assertClassroomWorkAllowed(tx, submission.assignment.classroomId);
    if (!submission.assignment.allowAttachments)
      throw new AssignmentOperationError("此作业不接收附件", 400);
  }
  return submission;
}

export async function listSubmissionAttachments(
  actor: AuthenticatedUser,
  submissionId: string,
) {
  await access(prisma, actor, submissionId);
  return prisma.submissionAttachment.findMany({
    where: { submissionId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      assignmentQuestionId: true,
      originalName: true,
      sizeBytes: true,
      mimeType: true,
    },
  });
}

export async function validateAssignmentAttachmentData(
  data: Buffer,
): Promise<string> {
  if (data.length > 5 * 1024 * 1024 || !data.length)
    throw new AssignmentOperationError("附件大小须在 1 字节至 5 MB 之间", 400);
  let imageType: string | null = null;
  if (
    data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    data.length > 32 &&
    data.subarray(-8, -4).toString() === "IEND"
  )
    imageType = "image/png";
  if (
    data[0] === 255 &&
    data[1] === 216 &&
    data[data.length - 2] === 255 &&
    data[data.length - 1] === 217
  )
    imageType = "image/jpeg";
  if (imageType) {
    try {
      await sharp(data, {
        limitInputPixels: 20_000_000,
        failOn: "warning",
      }).stats();
      return imageType;
    } catch {
      throw new AssignmentOperationError(
        "图片无法读取或尺寸过大，请更换有效截图",
        400,
      );
    }
  }
  if (data.subarray(0, 5).toString() === "%PDF-") {
    try {
      const doc = await PDFDocument.load(data);
      if (doc.getPageCount() > 100) throw new Error("pages");
      return "application/pdf";
    } catch {
      throw new AssignmentOperationError("PDF 无法读取，请更换有效文件", 400);
    }
  }
  throw new AssignmentOperationError("仅支持 PNG、JPG 图片和 PDF 文件", 400);
}

export async function uploadSubmissionAttachment(
  actor: AuthenticatedUser,
  submissionId: string,
  questionId: string,
  file: File,
  context: AuditRequestContext,
) {
  if (file.size > 5 * 1024 * 1024)
    throw new AssignmentOperationError("单个附件不能超过 5 MB", 400);
  const data = Buffer.from(await file.arrayBuffer());
  const mimeType = await validateAssignmentAttachmentData(data);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const storageKey = `assignment-attachments/${randomUUID()}`;
  const storage = getStorageService();
  await storage.save(storageKey, data);
  let stored = false;
  try {
    const result = await runAssignmentSerializable(async (tx) => {
      // Lock the attempt so attachment changes cannot race a final submission.
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Submission" WHERE "id" = ${submissionId} FOR UPDATE`,
      );
      const submission = await access(tx, actor, submissionId, true);
      const question = await tx.assignmentQuestion.findFirst({
        where: {
          id: questionId,
          assignmentId: submission.assignmentId,
          typeSnapshot: "SHORT_ANSWER",
        },
        select: { id: true },
      });
      if (!question) throw new ResourceNotFoundError("附件题目不存在");
      const existing = await tx.submissionAttachment.findFirst({
        where: {
          submissionId,
          assignmentQuestionId: questionId,
          sha256,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) return { ...existing, created: false };
      if (
        (await tx.submissionAttachment.count({
          where: {
            submissionId,
            assignmentQuestionId: questionId,
            deletedAt: null,
          },
        })) >= 5
      )
        throw new AssignmentOperationError("每道题最多上传 5 个附件", 400);
      const attachment = await tx.submissionAttachment.create({
        data: {
          submissionId,
          assignmentQuestionId: questionId,
          storageKey,
          sha256,
          mimeType,
          sizeBytes: data.length,
          originalName:
            file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 200) || "附件",
        },
        select: { id: true },
      });
      await writeTeachingAuditLog(tx, {
        actorId: actor.id,
        action: AuditAction.SUBMISSION_ATTACHMENT_UPLOADED,
        targetType: AuditTargetType.SUBMISSION,
        targetId: submissionId,
        summary: "上传作业附件",
        beforeData: null,
        afterData: {
          attachmentId: attachment.id,
          questionId,
          sizeBytes: data.length,
        },
        context,
      });
      return { ...attachment, created: true };
    }, "附件正在更新，请重试");
    stored = result.created;
    return { id: result.id };
  } finally {
    if (!stored) await storage.delete(storageKey);
  }
}

export async function readSubmissionAttachment(
  actor: AuthenticatedUser,
  submissionId: string,
  attachmentId: string,
  context: AuditRequestContext,
) {
  await access(prisma, actor, submissionId);
  const file = await prisma.submissionAttachment.findFirst({
    where: { id: attachmentId, submissionId, deletedAt: null },
  });
  if (!file) throw new ResourceNotFoundError("附件不存在");
  const data = await getStorageService().read(file.storageKey);
  await writeTeachingAuditLog(prisma, {
    actorId: actor.id,
    action: AuditAction.SUBMISSION_ATTACHMENT_DOWNLOADED,
    targetType: AuditTargetType.SUBMISSION,
    targetId: submissionId,
    summary: "下载作业附件",
    beforeData: null,
    afterData: { attachmentId },
    context,
  });
  return { file, data };
}

export async function deleteSubmissionAttachment(
  actor: AuthenticatedUser,
  submissionId: string,
  attachmentId: string,
  context: AuditRequestContext,
) {
  await runAssignmentSerializable(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Submission" WHERE "id" = ${submissionId} FOR UPDATE`,
    );
    await access(tx, actor, submissionId, true);
    const file = await tx.submissionAttachment.findFirst({
      where: { id: attachmentId, submissionId, deletedAt: null },
      select: { id: true },
    });
    if (!file) throw new ResourceNotFoundError("附件不存在");
    await tx.submissionAttachment.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });
    await writeTeachingAuditLog(tx, {
      actorId: actor.id,
      action: AuditAction.SUBMISSION_ATTACHMENT_DELETED,
      targetType: AuditTargetType.SUBMISSION,
      targetId: submissionId,
      summary: "移除作业附件",
      beforeData: null,
      afterData: { attachmentId },
      context,
    });
  }, "附件正在更新，请重试");
}
