import {
  AuditAction,
  AuditTargetType,
  ClassroomStatus,
  CourseStatus,
  MembershipStatus,
  Prisma,
  StudentImportBatchStatus,
  StudentImportExecutionStatus,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type {
  AuditConfigSnapshot,
  AuditRequestContext,
} from "@/services/audit/types";
import { CourseOperationError } from "@/services/courses/errors";
import {
  findActiveCourseTemplateById,
  findCourseTemplateById,
  findCourseSyllabusByCourseId,
  findTeacherClassroomById,
  findTeacherCourseById,
  findTeacherCourseSyllabus,
  loadCourseTemplates,
  loadTeacherClassroomsForCourseLink,
  loadTeacherCourses,
  createCourseSyllabusRecord,
  type CourseSyllabusRecord,
  type CourseTemplateRecord,
  type TeacherCourseClassroomRecord,
  type TeacherCourseRecord,
} from "@/services/courses/repository";
import type {
  CreateCourseData,
  CreateCourseTemplateData,
  UpdateCourseData,
  UpdateCourseTemplateData,
} from "@/services/courses/schemas";
import type {
  CourseTemplateView,
  CourseSyllabusDownload,
  CourseSyllabusView,
  TeacherCourseClassroomView,
  TeacherCourseDeletionResult,
  TeacherCourseDetail,
  TeacherCourseListItem,
} from "@/services/courses/types";
import { getStorageService } from "@/services/storage";
import type { StorageService } from "@/services/storage/types";

function isKnownPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

const SYLLABUS_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const PDF_MIME_TYPE = "application/pdf";
const PDF_HEADER = Buffer.from("%PDF-");

async function assertReadablePdf(data: Buffer): Promise<void> {
  try {
    const document = await PDFDocument.load(data, {
      ignoreEncryption: false,
      updateMetadata: false,
      throwOnInvalidObject: true,
    });
    document.getPageCount();
  } catch {
    throw new CourseOperationError(
      "教学大纲 PDF 已损坏、被加密或无法解析，请更换文件后重试。",
      400,
    );
  }
}

export interface CourseSyllabusUploadFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface CourseSyllabusUploadDependencies {
  storage?: StorageService;
  storageKeyFactory?: () => string;
  logger?: Pick<Console, "error">;
}

interface ValidatedSyllabusFile {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  data: Buffer;
}

function generatedSyllabusStorageKey(): string {
  return `course-syllabi/${randomUUID()}.pdf`;
}

function originalFileBaseName(name: string): string {
  return path.basename(name.replace(/\\/gu, "/")).trim();
}

async function validatedSyllabusFile(
  file: CourseSyllabusUploadFile | null | undefined,
): Promise<ValidatedSyllabusFile> {
  if (!file) {
    throw new CourseOperationError("请上传教学大纲 PDF。", 400);
  }

  const originalName = originalFileBaseName(file.name);
  if (!originalName) {
    throw new CourseOperationError("教学大纲文件名不能为空。", 400);
  }

  if (!originalName.toLowerCase().endsWith(".pdf")) {
    throw new CourseOperationError("教学大纲仅支持 PDF 文件。", 400);
  }

  if (file.type !== PDF_MIME_TYPE) {
    throw new CourseOperationError(
      "教学大纲文件 MIME 类型必须为 application/pdf。",
      400,
    );
  }

  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new CourseOperationError("教学大纲文件不能为空。", 400);
  }

  if (file.size > SYLLABUS_MAX_SIZE_BYTES) {
    throw new CourseOperationError("教学大纲文件不能超过 20 MB。", 413);
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (data.length === 0) {
    throw new CourseOperationError("教学大纲文件不能为空。", 400);
  }

  if (data.length > SYLLABUS_MAX_SIZE_BYTES) {
    throw new CourseOperationError("教学大纲文件不能超过 20 MB。", 413);
  }

  if (!data.subarray(0, PDF_HEADER.length).equals(PDF_HEADER)) {
    throw new CourseOperationError("教学大纲文件内容不是合法 PDF。", 400);
  }
  await assertReadablePdf(data);

  return {
    originalName,
    mimeType: PDF_MIME_TYPE,
    sizeBytes: data.length,
    data,
  };
}

function templateSnapshot(template: CourseTemplateRecord): AuditConfigSnapshot {
  return {
    code: template.code,
    name: template.name,
    description: template.description,
    version: template.version,
    isBuiltin: template.isBuiltin,
    isActive: template.isActive,
    courseCount: template._count.courses,
  };
}

function courseSnapshot(item: TeacherCourseListItem): AuditConfigSnapshot {
  return {
    templateCode: item.template.code,
    templateName: item.template.name,
    courseNo: item.courseNo,
    term: item.term,
    name: item.name,
    description: item.description,
    status: item.status,
    classroomCount: item.classroomCount,
    activeClassroomCount: item.activeClassroomCount,
    activeStudentCount: item.activeStudentCount,
  };
}

function syllabusSnapshot(syllabus: CourseSyllabusRecord): AuditConfigSnapshot {
  return {
    courseId: syllabus.courseId,
    versionNumber: syllabus.versionNumber,
    originalName: syllabus.originalName,
    mimeType: syllabus.mimeType,
    sizeBytes: syllabus.sizeBytes,
    uploadedById: syllabus.uploadedById,
    uploadedAt: syllabus.updatedAt.toISOString(),
  };
}

function classroomAssociationSnapshot(
  classroom: TeacherCourseClassroomRecord,
): AuditConfigSnapshot {
  return {
    classroomName: classroom.name,
    classroomStatus: classroom.status,
    classroomId: classroom.id,
    currentCourseId: classroom.course?.id ?? null,
    currentCourseName: classroom.course?.name ?? null,
    currentCourseNo: classroom.course?.courseNo ?? null,
    currentCourseTerm: classroom.course?.term ?? null,
  };
}

function classroomViewFromRecord(
  classroom: TeacherCourseClassroomRecord,
): TeacherCourseClassroomView {
  return {
    id: classroom.id,
    name: classroom.name,
    description: classroom.description,
    status: classroom.status,
    allowStudentLeave: classroom.allowStudentLeave,
    studentCount: classroom._count.memberships,
    currentCourse: classroom.course
      ? {
          id: classroom.course.id,
          name: classroom.course.name,
          courseNo: classroom.course.courseNo,
          term: classroom.course.term,
          status: classroom.course.status,
        }
      : null,
    createdAt: classroom.createdAt,
    updatedAt: classroom.updatedAt,
  };
}

function templateViewFromRecord(
  template: CourseTemplateRecord,
): CourseTemplateView {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    description: template.description,
    version: template.version,
    isBuiltin: template.isBuiltin,
    isActive: template.isActive,
    courseCount: template._count.courses,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function courseItemFromRecord(
  record: TeacherCourseRecord,
): TeacherCourseListItem {
  const classroomCount = record.classrooms.length;
  const activeClassroomCount = record.classrooms.filter(
    (classroom) => classroom.status === ClassroomStatus.ACTIVE,
  ).length;
  const activeStudentCount = record.classrooms.reduce(
    (sum, classroom) => sum + classroom._count.memberships,
    0,
  );

  return {
    id: record.id,
    template: {
      id: record.template.id,
      code: record.template.code,
      name: record.template.name,
      description: null,
      version: record.template.version,
      isBuiltin: record.template.isBuiltin,
    },
    courseNo: record.courseNo,
    term: record.term,
    name: record.name,
    description: record.description,
    status: record.status,
    publishedAt: record.publishedAt,
    archivedAt: record.archivedAt,
    classroomCount,
    activeClassroomCount,
    activeStudentCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function syllabusViewFromRecord(
  record: CourseSyllabusRecord,
): CourseSyllabusView {
  return {
    id: record.id,
    courseId: record.courseId,
    versionNumber: record.versionNumber,
    originalName: record.originalName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    uploadedAt: record.updatedAt,
    uploadedBy: {
      id: record.uploadedBy.id,
      displayName: record.uploadedBy.profile?.displayName ?? null,
      email: record.uploadedBy.email,
    },
  };
}

function courseDetailFromRecords(
  course: TeacherCourseRecord,
  classrooms: TeacherCourseClassroomRecord[],
): TeacherCourseDetail {
  const item = courseItemFromRecord(course);
  return {
    ...item,
    linkedClassrooms: classrooms
      .filter((classroom) => classroom.courseId === course.id)
      .map(classroomViewFromRecord),
    classrooms: classrooms.map(classroomViewFromRecord),
  };
}

function courseUpdateSnapshot(
  course: TeacherCourseListItem,
): AuditConfigSnapshot {
  return {
    ...courseSnapshot(course),
    templateCode: course.template.code,
    templateName: course.template.name,
  };
}

function courseDeletionSnapshot(
  course: TeacherCourseRecord,
  deletedAt: Date,
): AuditConfigSnapshot {
  return {
    courseId: course.id,
    title: course.name,
    name: course.name,
    courseNo: course.courseNo,
    term: course.term,
    teacherId: course.teacherId,
    templateId: course.templateId,
    templateCode: course.template.code,
    status: course.status,
    classroomIds: course.classrooms.map((classroom) => classroom.id),
    deletedAt: deletedAt.toISOString(),
  };
}

function throwIfUniqueConstraintError(error: unknown, message: string): never {
  if (isKnownPrismaError(error, "P2002")) {
    throw new CourseOperationError(message);
  }
  throw error;
}

function isTransactionConflict(error: unknown): boolean {
  return isKnownPrismaError(error, "P2034");
}

export async function listAdminCourseTemplates(): Promise<
  CourseTemplateView[]
> {
  return (await loadCourseTemplates()).map(templateViewFromRecord);
}

export async function getAdminCourseTemplate(
  templateId: string,
): Promise<CourseTemplateView> {
  const template = await findCourseTemplateById(templateId);
  if (!template) {
    throw new ResourceNotFoundError("课程模板不存在");
  }
  return templateViewFromRecord(template);
}

export async function createAdminCourseTemplate(
  actorId: string,
  input: CreateCourseTemplateData,
  context: AuditRequestContext,
): Promise<CourseTemplateView> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const template = await transaction.courseTemplate.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          version: input.version,
          isBuiltin: false,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          version: true,
          isBuiltin: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { courses: true } },
        },
      });

      await writeGovernanceAuditLog(transaction, {
        actorId,
        action: AuditAction.COURSE_TEMPLATE_CREATED,
        targetType: AuditTargetType.COURSE_TEMPLATE,
        targetId: template.id,
        summary: `创建课程模板：${template.name}`,
        beforeData: null,
        afterData: templateSnapshot(template),
        context,
      });

      return templateViewFromRecord(template);
    });
  } catch (error: unknown) {
    throwIfUniqueConstraintError(error, "课程模板编码已存在");
  }
}

export async function updateAdminCourseTemplate(
  actorId: string,
  templateId: string,
  input: UpdateCourseTemplateData,
  context: AuditRequestContext,
): Promise<CourseTemplateView> {
  return prisma.$transaction(async (transaction) => {
    const before = await findCourseTemplateById(templateId, transaction);
    if (!before) {
      throw new ResourceNotFoundError("课程模板不存在");
    }

    const nextName = input.name;
    const nextDescription = input.description;
    const nextVersion = input.version;
    const changed =
      nextName !== before.name ||
      nextDescription !== before.description ||
      nextVersion !== before.version;

    if (!changed) {
      return templateViewFromRecord(before);
    }

    const after = await transaction.courseTemplate.update({
      where: { id: templateId },
      data: {
        name: nextName,
        description: nextDescription,
        version: nextVersion,
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        version: true,
        isBuiltin: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { courses: true } },
      },
    });

    await writeGovernanceAuditLog(transaction, {
      actorId,
      action: AuditAction.COURSE_TEMPLATE_UPDATED,
      targetType: AuditTargetType.COURSE_TEMPLATE,
      targetId: templateId,
      summary: `更新课程模板：${after.name}`,
      beforeData: templateSnapshot(before),
      afterData: templateSnapshot(after),
      context,
    });

    return templateViewFromRecord(after);
  });
}

export async function setAdminCourseTemplateActive(
  actorId: string,
  templateId: string,
  isActive: boolean,
  context: AuditRequestContext,
): Promise<CourseTemplateView> {
  return prisma.$transaction(async (transaction) => {
    const before = await findCourseTemplateById(templateId, transaction);
    if (!before) {
      throw new ResourceNotFoundError("课程模板不存在");
    }

    if (before.isActive === isActive) {
      return templateViewFromRecord(before);
    }

    const after = await transaction.courseTemplate.update({
      where: { id: templateId },
      data: { isActive },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        version: true,
        isBuiltin: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { courses: true } },
      },
    });

    await writeGovernanceAuditLog(transaction, {
      actorId,
      action: isActive
        ? AuditAction.COURSE_TEMPLATE_ENABLED
        : AuditAction.COURSE_TEMPLATE_DISABLED,
      targetType: AuditTargetType.COURSE_TEMPLATE,
      targetId: templateId,
      summary: `${isActive ? "启用" : "停用"}课程模板：${after.name}`,
      beforeData: templateSnapshot(before),
      afterData: templateSnapshot(after),
      context,
    });

    return templateViewFromRecord(after);
  });
}

export async function listTeacherCourseTemplates(): Promise<
  CourseTemplateView[]
> {
  return (await loadCourseTemplates(prisma, true)).map(templateViewFromRecord);
}

export async function listTeacherCourses(
  teacherId: string,
): Promise<TeacherCourseListItem[]> {
  return (await loadTeacherCourses(teacherId)).map(courseItemFromRecord);
}

export async function getTeacherCourse(
  teacherId: string,
  courseId: string,
): Promise<TeacherCourseDetail> {
  const course = await findTeacherCourseById(teacherId, courseId);
  if (!course) {
    throw new ResourceNotFoundError("课程不存在");
  }

  const classrooms = await loadTeacherClassroomsForCourseLink(teacherId);
  return courseDetailFromRecords(course, classrooms);
}

export async function getTeacherCourseSyllabus(
  teacherId: string,
  courseId: string,
): Promise<CourseSyllabusView | null> {
  const course = await findTeacherCourseById(teacherId, courseId);
  if (!course) {
    throw new ResourceNotFoundError("课程不存在。");
  }

  const syllabus = await findTeacherCourseSyllabus(teacherId, courseId);
  return syllabus ? syllabusViewFromRecord(syllabus) : null;
}

async function cleanupSavedSyllabusFile(
  storage: StorageService,
  storageKey: string,
  logger: Pick<Console, "error">,
): Promise<void> {
  try {
    await storage.delete(storageKey);
  } catch (cleanupError: unknown) {
    logger.error("Failed to clean course syllabus file", cleanupError);
  }
}

export async function uploadTeacherCourseSyllabus(
  teacherId: string,
  courseId: string,
  file: CourseSyllabusUploadFile | null | undefined,
  context: AuditRequestContext,
  dependencies: CourseSyllabusUploadDependencies = {},
): Promise<CourseSyllabusView> {
  const course = await findTeacherCourseById(teacherId, courseId);
  if (!course) {
    throw new ResourceNotFoundError("课程不存在。");
  }

  const upload = await validatedSyllabusFile(file);
  const storage = dependencies.storage ?? getStorageService();
  const logger = dependencies.logger ?? console;
  const storageKey =
    dependencies.storageKeyFactory?.() ?? generatedSyllabusStorageKey();

  try {
    await storage.save(storageKey, upload.data);
  } catch (error: unknown) {
    logger.error("Failed to save course syllabus file", error);
    throw new CourseOperationError("教学大纲文件保存失败，请稍后重试。", 500);
  }

  let transactionResult: { savedSyllabus: CourseSyllabusRecord };

  try {
    transactionResult = await prisma.$transaction(async (transaction) => {
      const currentCourse = await findTeacherCourseById(
        teacherId,
        courseId,
        transaction,
      );
      if (!currentCourse) {
        throw new ResourceNotFoundError("课程不存在。");
      }

      const previousSyllabus = await findCourseSyllabusByCourseId(
        courseId,
        transaction,
      );
      const nextSyllabus = await createCourseSyllabusRecord(
        {
          courseId,
          uploadedById: teacherId,
          versionNumber: (previousSyllabus?.versionNumber ?? 0) + 1,
          originalName: upload.originalName,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          checksumSha256: createHash("sha256")
            .update(upload.data)
            .digest("hex"),
          storageKey,
        },
        transaction,
      );

      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.COURSE_UPDATED,
        targetType: AuditTargetType.COURSE_FILE,
        targetId: nextSyllabus.id,
        summary: previousSyllabus
          ? `替换教学大纲：${currentCourse.name}`
          : `首次上传教学大纲：${currentCourse.name}`,
        beforeData: previousSyllabus
          ? syllabusSnapshot(previousSyllabus)
          : null,
        afterData: syllabusSnapshot(nextSyllabus),
        context,
      });

      return {
        savedSyllabus: nextSyllabus,
      };
    });
  } catch (error: unknown) {
    await cleanupSavedSyllabusFile(storage, storageKey, logger);
    throw error;
  }

  return syllabusViewFromRecord(transactionResult.savedSyllabus);
}

export async function downloadTeacherCourseSyllabus(
  teacherId: string,
  courseId: string,
  dependencies: Pick<
    CourseSyllabusUploadDependencies,
    "storage" | "logger"
  > = {},
): Promise<CourseSyllabusDownload> {
  const syllabus = await getTeacherCourseSyllabus(teacherId, courseId);
  if (!syllabus) {
    throw new ResourceNotFoundError("教学大纲不存在。");
  }

  const storage = dependencies.storage ?? getStorageService();
  const logger = dependencies.logger ?? console;
  const record = await findTeacherCourseSyllabus(teacherId, courseId);
  if (!record) {
    throw new ResourceNotFoundError("教学大纲不存在。");
  }

  try {
    return {
      syllabus,
      data: await storage.read(record.storageKey),
    };
  } catch (error: unknown) {
    logger.error("Failed to read course syllabus file", error);
    throw new CourseOperationError(
      "教学大纲文件暂时无法下载，请稍后重试。",
      500,
    );
  }
}

export async function createTeacherCourse(
  teacherId: string,
  input: CreateCourseData,
  context: AuditRequestContext,
): Promise<TeacherCourseDetail> {
  const template = await findActiveCourseTemplateById(input.templateId);
  if (!template) {
    throw new ResourceNotFoundError("课程模板不存在或已停用");
  }

  try {
    const course = await prisma.$transaction(async (transaction) => {
      const created = await transaction.course.create({
        data: {
          templateId: template.id,
          teacherId,
          courseNo: input.courseNo,
          term: input.term,
          name: input.name,
          description: input.description,
          status: CourseStatus.ACTIVE,
        },
        select: {
          id: true,
          templateId: true,
          teacherId: true,
          courseNo: true,
          term: true,
          name: true,
          description: true,
          status: true,
          publishedAt: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
          template: {
            select: {
              id: true,
              code: true,
              name: true,
              version: true,
              isBuiltin: true,
            },
          },
          classrooms: {
            select: {
              id: true,
              status: true,
              _count: {
                select: {
                  memberships: {
                    where: {
                      status: MembershipStatus.ACTIVE,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const createdView = courseItemFromRecord(created);
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.COURSE_CREATED,
        targetType: AuditTargetType.COURSE,
        targetId: created.id,
        summary: `创建课程：${created.name}（${created.courseNo} / ${created.term}）`,
        beforeData: null,
        afterData: courseUpdateSnapshot(createdView),
        context,
      });

      return created.id;
    });

    return getTeacherCourse(teacherId, course);
  } catch (error: unknown) {
    throwIfUniqueConstraintError(
      error,
      "同一教师在同一学期下已经存在相同课程号的课程",
    );
  }
}

export async function updateTeacherCourse(
  teacherId: string,
  courseId: string,
  input: UpdateCourseData,
  context: AuditRequestContext,
): Promise<TeacherCourseDetail> {
  return prisma.$transaction(async (transaction) => {
    const before = await findTeacherCourseById(
      teacherId,
      courseId,
      transaction,
    );
    if (!before) {
      throw new ResourceNotFoundError("课程不存在");
    }

    const beforeView = courseItemFromRecord(before);
    const changed =
      input.courseNo !== before.courseNo ||
      input.term !== before.term ||
      input.name !== before.name ||
      input.description !== before.description;

    if (!changed) {
      const classrooms = await loadTeacherClassroomsForCourseLink(
        teacherId,
        transaction,
      );
      return courseDetailFromRecords(before, classrooms);
    }

    try {
      await transaction.course.update({
        where: { id: courseId },
        data: {
          courseNo: input.courseNo,
          term: input.term,
          name: input.name,
          description: input.description,
        },
      });
    } catch (error: unknown) {
      throwIfUniqueConstraintError(
        error,
        "同一教师在同一学期下已经存在相同课程号的课程",
      );
    }

    const after = await findTeacherCourseById(teacherId, courseId, transaction);
    if (!after) {
      throw new ResourceNotFoundError("课程不存在");
    }

    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.COURSE_UPDATED,
      targetType: AuditTargetType.COURSE,
      targetId: courseId,
      summary: `更新课程：${after.name}（${after.courseNo} / ${after.term}）`,
      beforeData: courseSnapshot(beforeView),
      afterData: courseSnapshot(courseItemFromRecord(after)),
      context,
    });

    const classrooms = await loadTeacherClassroomsForCourseLink(
      teacherId,
      transaction,
    );
    return courseDetailFromRecords(after, classrooms);
  });
}

interface CourseDeletionDependencies {
  storage?: StorageService;
  logger?: Pick<Console, "error">;
  writeAuditLog?: typeof writeGovernanceAuditLog;
}

interface OptionalSyllabusParseDraftDelegate {
  syllabusParseDraft?: {
    deleteMany(args: { where: { courseId: string } }): Promise<unknown>;
  };
}

async function deleteCourseSyllabusParseDrafts(
  transaction: Prisma.TransactionClient,
  courseId: string,
): Promise<void> {
  const delegate = (
    transaction as unknown as OptionalSyllabusParseDraftDelegate
  ).syllabusParseDraft;
  if (delegate) {
    await delegate.deleteMany({ where: { courseId } });
  }
}

async function deleteCourseFilesAfterCommit(
  storageKeys: string[],
  storage: StorageService,
  logger: Pick<Console, "error">,
): Promise<void> {
  const uniqueStorageKeys = [...new Set(storageKeys)];
  const results = await Promise.allSettled(
    uniqueStorageKeys.map((storageKey) => storage.delete(storageKey)),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error(
        `Failed to delete course file after database deletion: ${uniqueStorageKeys[index]}`,
        result.reason,
      );
    }
  });
}

export async function deleteTeacherCourse(
  teacherId: string,
  courseId: string,
  context: AuditRequestContext,
  dependencies: CourseDeletionDependencies = {},
): Promise<TeacherCourseDeletionResult> {
  const storage = dependencies.storage ?? getStorageService();
  const logger = dependencies.logger ?? console;
  const writeAuditLog = dependencies.writeAuditLog ?? writeGovernanceAuditLog;
  let transactionResult:
    | {
        result: TeacherCourseDeletionResult;
        storageKeys: string[];
      }
    | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      transactionResult = await prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "Course"
            WHERE "id" = ${courseId} AND "teacherId" = ${teacherId}
            FOR UPDATE
          `;

          const course = await findTeacherCourseById(
            teacherId,
            courseId,
            transaction,
          );
          if (!course) {
            throw new ResourceNotFoundError("课程不存在");
          }
          if (course.status !== CourseStatus.DRAFT) {
            throw new CourseOperationError(
              "只有尚未发布的草稿课程可以删除。",
              409,
            );
          }

          await transaction.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "Classroom"
            WHERE "courseId" = ${courseId}
            FOR UPDATE
          `;

          const classroomIds = course.classrooms.map(
            (classroom) => classroom.id,
          );
          if (classroomIds.length > 0) {
            const [
              assignmentCount,
              submissionCount,
              answerCount,
              analysisCount,
              recommendationCount,
            ] = await Promise.all([
              transaction.assignment.count({
                where: { classroomId: { in: classroomIds } },
              }),
              transaction.submission.count({
                where: {
                  assignment: { classroomId: { in: classroomIds } },
                },
              }),
              transaction.studentAnswer.count({
                where: {
                  submission: {
                    assignment: { classroomId: { in: classroomIds } },
                  },
                },
              }),
              transaction.aIAnalysis.count({
                where: { classroomId: { in: classroomIds } },
              }),
              transaction.personalizedRecommendation.count({
                where: {
                  analysis: {
                    classroomId: { in: classroomIds },
                  },
                },
              }),
            ]);

            if (assignmentCount > 0 || submissionCount > 0 || answerCount > 0) {
              throw new CourseOperationError(
                "该课程已经产生作业、学生作答、成绩或批改记录，不能删除。",
                409,
              );
            }
            if (analysisCount > 0 || recommendationCount > 0) {
              throw new CourseOperationError(
                "该课程已经产生学情分析、画像或推荐数据，不能删除。",
                409,
              );
            }
          }

          const processingImportBatchCount =
            await transaction.studentImportBatch.count({
              where: {
                courseId,
                status: StudentImportBatchStatus.PROCESSING,
              },
            });
          if (processingImportBatchCount > 0) {
            throw new CourseOperationError(
              "该课程的学生名单正在处理，请稍后再试。",
              409,
            );
          }

          const materializedImportBatchCount =
            await transaction.studentImportBatch.count({
              where: {
                courseId,
                OR: [
                  { importedRows: { gt: 0 } },
                  { identityAssignments: { some: {} } },
                  {
                    rows: {
                      some: {
                        OR: [
                          {
                            executionStatus:
                              StudentImportExecutionStatus.APPLIED,
                          },
                          { matchedMembershipId: { not: null } },
                          { createdMembershipId: { not: null } },
                          { createdUserId: { not: null } },
                          { studentIdentityId: { not: null } },
                        ],
                      },
                    },
                  },
                ],
              },
            });
          if (materializedImportBatchCount > 0) {
            throw new CourseOperationError(
              "该课程的学生名单已经正式导入或正在处理，不能删除。",
              409,
            );
          }

          const [courseFiles, syllabi] = await Promise.all([
            transaction.courseFileVersion.findMany({
              where: { courseId },
              select: { storageKey: true },
            }),
            transaction.courseSyllabus.findMany({
              where: { courseId },
              select: { storageKey: true },
            }),
          ]);
          const storageKeys = [
            ...courseFiles.map((file) => file.storageKey),
            ...syllabi.map((syllabus) => syllabus.storageKey),
          ];
          const deletedAt = new Date();
          const snapshot = courseDeletionSnapshot(course, deletedAt);

          await transaction.studentImportBatch.deleteMany({
            where: { courseId },
          });
          await transaction.course.update({
            where: { id: courseId },
            data: {
              currentPublishedSyllabusStructureId: null,
              currentPublishedKnowledgeGraphVersionId: null,
            },
          });
          const graphVersions =
            await transaction.publishedKnowledgeGraphVersion.findMany({
              where: { courseId },
              select: { id: true },
            });
          await transaction.questionKnowledgeGraphBindingSet.deleteMany({
            where: { courseId },
          });
          await transaction.publishedKnowledgeGraphEdge.deleteMany({
            where: {
              graphVersionId: { in: graphVersions.map((item) => item.id) },
            },
          });
          await transaction.publishedKnowledgeGraphNode.deleteMany({
            where: {
              graphVersionId: { in: graphVersions.map((item) => item.id) },
            },
          });
          await transaction.publishedKnowledgeGraphVersion.deleteMany({
            where: { courseId },
          });
          await transaction.knowledgeGraphReviewRevision.deleteMany({
            where: { courseId },
          });
          await transaction.knowledgeGraphDraft.deleteMany({
            where: { courseId },
          });
          await transaction.knowledgeGraphConcept.deleteMany({
            where: { courseId },
          });
          await transaction.publishedSyllabusStructure.deleteMany({
            where: { courseId },
          });
          await transaction.syllabusReviewRevision.deleteMany({
            where: { courseId },
          });
          await deleteCourseSyllabusParseDrafts(transaction, courseId);
          await transaction.courseSyllabus.deleteMany({
            where: { courseId },
          });
          await transaction.courseFileVersion.deleteMany({
            where: { courseId },
          });
          await transaction.classroom.updateMany({
            where: { courseId },
            data: { courseId: null },
          });
          await transaction.course.delete({ where: { id: courseId } });

          await writeAuditLog(transaction, {
            actorId: teacherId,
            action: AuditAction.COURSE_DELETED,
            targetType: AuditTargetType.COURSE,
            targetId: courseId,
            summary: `删除课程：${course.name}（${course.courseNo} / ${course.term}）`,
            beforeData: snapshot,
            afterData: {
              courseId,
              teacherId,
              deletedById: teacherId,
              deletedAt: deletedAt.toISOString(),
            },
            context,
          });

          return {
            result: {
              id: course.id,
              name: course.name,
              courseNo: course.courseNo,
              term: course.term,
              deletedAt,
            },
            storageKeys,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
      break;
    } catch (error: unknown) {
      if (isTransactionConflict(error) && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  if (!transactionResult) {
    throw new CourseOperationError("课程删除冲突，请稍后重试。", 409);
  }

  await deleteCourseFilesAfterCommit(
    transactionResult.storageKeys,
    storage,
    logger,
  );
  return transactionResult.result;
}

export async function linkTeacherClassroomToCourse(
  teacherId: string,
  courseId: string,
  classroomId: string,
  context: AuditRequestContext,
): Promise<TeacherCourseDetail> {
  return prisma.$transaction(async (transaction) => {
    const course = await findTeacherCourseById(
      teacherId,
      courseId,
      transaction,
    );
    if (!course) {
      throw new ResourceNotFoundError("课程不存在");
    }

    const classroom = await findTeacherClassroomById(
      teacherId,
      classroomId,
      transaction,
    );
    if (!classroom) {
      throw new ResourceNotFoundError("班级不存在");
    }

    if (classroom.courseId === courseId) {
      const classrooms = await loadTeacherClassroomsForCourseLink(
        teacherId,
        transaction,
      );
      return courseDetailFromRecords(course, classrooms);
    }

    await transaction.classroom.update({
      where: { id: classroomId },
      data: { courseId },
    });

    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.COURSE_CLASSROOM_LINKED,
      targetType: AuditTargetType.CLASSROOM,
      targetId: classroomId,
      summary: `将班级 ${classroom.name} 关联到课程 ${course.name}`,
      beforeData: classroomAssociationSnapshot(classroom),
      afterData: classroomAssociationSnapshot({
        ...classroom,
        courseId,
        course: {
          id: course.id,
          name: course.name,
          courseNo: course.courseNo,
          term: course.term,
          status: course.status,
        },
      }),
      context,
    });

    const nextCourse = await findTeacherCourseById(
      teacherId,
      courseId,
      transaction,
    );
    if (!nextCourse) {
      throw new ResourceNotFoundError("课程不存在");
    }
    const classrooms = await loadTeacherClassroomsForCourseLink(
      teacherId,
      transaction,
    );
    return courseDetailFromRecords(nextCourse, classrooms);
  });
}

export async function unlinkTeacherClassroomFromCourse(
  teacherId: string,
  courseId: string,
  classroomId: string,
  context: AuditRequestContext,
): Promise<TeacherCourseDetail> {
  return prisma.$transaction(async (transaction) => {
    const course = await findTeacherCourseById(
      teacherId,
      courseId,
      transaction,
    );
    if (!course) {
      throw new ResourceNotFoundError("课程不存在");
    }

    const classroom = await findTeacherClassroomById(
      teacherId,
      classroomId,
      transaction,
    );
    if (!classroom || classroom.courseId !== courseId) {
      throw new ResourceNotFoundError("班级关联不存在");
    }

    await transaction.classroom.update({
      where: { id: classroomId },
      data: { courseId: null },
    });

    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.COURSE_CLASSROOM_UNLINKED,
      targetType: AuditTargetType.CLASSROOM,
      targetId: classroomId,
      summary: `将班级 ${classroom.name} 从课程 ${course.name} 中解除关联`,
      beforeData: classroomAssociationSnapshot(classroom),
      afterData: classroomAssociationSnapshot({
        ...classroom,
        courseId: null,
        course: null,
      }),
      context,
    });

    const nextCourse = await findTeacherCourseById(
      teacherId,
      courseId,
      transaction,
    );
    if (!nextCourse) {
      throw new ResourceNotFoundError("课程不存在");
    }
    const classrooms = await loadTeacherClassroomsForCourseLink(
      teacherId,
      transaction,
    );
    return courseDetailFromRecords(nextCourse, classrooms);
  });
}
