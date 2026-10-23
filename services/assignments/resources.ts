import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { AuditAction, AuditTargetType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorageService } from "@/services/storage";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { AssignmentOperationError } from "./errors";
import { assignmentTaskSchema } from "./schemas";
import { validateAssignmentAttachmentData } from "./attachments";
import { extractDocxText } from "@/services/question-import/docx-extractor";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import type { AuthenticatedUser } from "@/services/auth/types";

type Actor = Pick<AuthenticatedUser, "id" | "role">;
const purpose = "ASSIGNMENT_RESOURCE";

export async function validateAssignmentResourceFiles(
  tx: Prisma.TransactionClient,
  teacherId: string,
  courseId: string | null,
  ids: readonly string[],
) {
  if (!ids.length) return;
  if (!courseId || ids.length > 5 || new Set(ids).size !== ids.length)
    throw new AssignmentOperationError(
      "请在所属课程内选择至多5个不同的教师附件",
      400,
    );
  const files = await tx.courseFileVersion.count({
    where: {
      id: { in: [...ids] },
      courseId,
      uploadedById: teacherId,
      fileKind: "OTHER",
      metadata: { path: ["purpose"], equals: purpose },
      course: { teacherId },
    },
  });
  if (files !== ids.length)
    throw new ResourceNotFoundError("教师附件不存在或不属于当前课程");
}

async function resourceAccess(actor: Actor, assignmentId: string) {
  if (actor.role !== Role.TEACHER && actor.role !== Role.STUDENT)
    throw new ResourceNotFoundError("作业不存在");
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      ...(actor.role === Role.TEACHER
        ? { teacherId: actor.id }
        : {
            status: { in: ["PUBLISHED", "CLOSED"] },
            publishedAt: { lte: new Date() },
            classroom: {
              memberships: { some: { studentId: actor.id, status: "ACTIVE" } },
            },
          }),
    },
    select: {
      submissionTask: true,
      classroom: { select: { courseId: true } },
      teacherId: true,
    },
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");
  const task = assignmentTaskSchema.safeParse(assignment.submissionTask);
  return { ...assignment, ids: task.success ? task.data.resourceFileIds : [] };
}

export async function listAssignmentResourceFiles(
  actor: Actor,
  assignmentId: string,
) {
  const assignment = await resourceAccess(actor, assignmentId);
  if (!assignment.ids.length) return [];
  return (
    await prisma.courseFileVersion.findMany({
      where: {
        id: { in: assignment.ids },
        courseId: assignment.classroom.courseId,
        uploadedById: assignment.teacherId,
        fileKind: "OTHER",
        metadata: { path: ["purpose"], equals: purpose },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, originalFileName: true, sizeBytes: true },
    })
  ).map((file) => ({
    id: file.id,
    name: file.originalFileName,
    sizeBytes: file.sizeBytes,
  }));
}

export async function uploadAssignmentResource(
  teacherId: string,
  courseId: string,
  file: File,
  context: AuditRequestContext,
) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId, status: { not: "ARCHIVED" } },
    select: { id: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw new AssignmentOperationError("教师附件须在1字节至5MB之间", 400);
  const data = Buffer.from(await file.arrayBuffer());
  if (!data.length || data.length > 5 * 1024 * 1024)
    throw new AssignmentOperationError("附件实际大小须在1字节至5MB之间", 400);
  const extension = file.name.toLowerCase().split(".").at(-1);
  let mimeType: string;
  if (extension === "docx") {
    if (data[0] !== 0x50 || data[1] !== 0x4b)
      throw new AssignmentOperationError("Word文件格式无效", 400);
    try {
      await extractDocxText(data);
    } catch {
      throw new AssignmentOperationError(
        "Word文件无法解析，请更换有效docx文件",
        400,
      );
    }
    mimeType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (extension === "txt" || extension === "py") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      if (text.includes("\0")) throw new Error("binary");
    } catch {
      throw new AssignmentOperationError(
        "文本和Python文件须使用UTF-8纯文本格式",
        400,
      );
    }
    mimeType = extension === "py" ? "text/x-python" : "text/plain";
  } else {
    mimeType = await validateAssignmentAttachmentData(data);
    const expected: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
    };
    if (!extension || expected[extension] !== mimeType)
      throw new AssignmentOperationError("文件扩展名与内容不匹配", 400);
  }
  if (
    file.type &&
    file.type !== mimeType &&
    file.type !== "application/octet-stream" &&
    !(
      extension === "py" &&
      ["text/plain", "text/x-python-script"].includes(file.type)
    )
  )
    throw new AssignmentOperationError("文件MIME类型与内容不匹配", 400);
  const storageKey = `assignment-resources/${randomUUID()}`;
  const storage = getStorageService();
  await storage.save(storageKey, data);
  try {
    return await prisma.$transaction(async (tx) => {
      const valid = await tx.course.findFirst({
        where: { id: courseId, teacherId, status: { not: "ARCHIVED" } },
        select: { id: true },
      });
      if (!valid) throw new ResourceNotFoundError("课程不存在");
      const name =
        file.name.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 200) || "任务附件";
      const result = await tx.courseFileVersion.create({
        data: {
          courseId,
          uploadedById: teacherId,
          fileKind: "OTHER",
          fileKey: `assignment-${randomUUID()}`,
          title: name.slice(0, 120),
          versionNumber: 1,
          originalFileName: name,
          storageKey,
          mimeType,
          sizeBytes: data.length,
          checksumSha256: createHash("sha256").update(data).digest("hex"),
          metadata: { purpose },
        },
        select: { id: true, originalFileName: true, sizeBytes: true },
      });
      await writeGovernanceAuditLog(tx, {
        actorId: teacherId,
        action: AuditAction.COURSE_FILE_UPLOADED,
        targetType: AuditTargetType.COURSE_FILE,
        targetId: result.id,
        summary: "上传教师任务附件",
        beforeData: null,
        afterData: { courseId, sizeBytes: data.length, purpose },
        context,
      });
      return {
        id: result.id,
        name: result.originalFileName,
        sizeBytes: result.sizeBytes,
      };
    });
  } catch (error) {
    await storage.delete(storageKey);
    throw error;
  }
}

export async function readAssignmentResource(
  actor: Actor,
  assignmentId: string,
  fileId: string,
  context: AuditRequestContext,
) {
  const assignment = await resourceAccess(actor, assignmentId);
  if (!assignment.ids.includes(fileId))
    throw new ResourceNotFoundError("附件不存在");
  const file = await prisma.courseFileVersion.findFirst({
    where: {
      id: fileId,
      courseId: assignment.classroom.courseId,
      uploadedById: assignment.teacherId,
      fileKind: "OTHER",
      metadata: { path: ["purpose"], equals: purpose },
    },
  });
  if (!file) throw new ResourceNotFoundError("附件不存在");
  const data = await getStorageService().read(file.storageKey);
  await writeGovernanceAuditLog(prisma, {
    actorId: actor.id,
    action: AuditAction.COURSE_FILE_DOWNLOADED,
    targetType: AuditTargetType.COURSE_FILE,
    targetId: file.id,
    summary: "下载教师任务附件",
    beforeData: null,
    afterData: { assignmentId },
    context,
  });
  return { file, data };
}
