import {
  AuditAction,
  AuditTargetType,
  ClassroomStatus,
  CourseStatus,
  MembershipStatus,
  Prisma,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractQuestionFile } from "@/services/question-import/file-extractor";

import { prisma } from "@/lib/prisma";
import { courseCoverOf } from "@/lib/course-covers";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type {
  AuditConfigSnapshot,
  AuditRequestContext,
} from "@/services/audit/types";
import { CourseOperationError } from "@/services/courses/errors";
import {
  findCourseTemplateById,
  findCourseSyllabusByCourseId,
  findTeacherClassroomById,
  findTeacherCourseById,
  findTeacherCourseSyllabus,
  loadCourseTemplates,
  resolveActiveCourseTemplateForSchool,
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
import {
  listQuestionCourseCategories,
  requireActiveQuestionCourseCategory,
} from "@/services/question-course-categories/service";
import { requireUserSchoolId } from "@/services/schools/tenant";

function isKnownPrismaError(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

const SYLLABUS_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const PDF_MIME_TYPE = "application/pdf";
const PDF_HEADER = Buffer.from("%PDF-");
const SYLLABUS_MIME_TYPES: Record<string, string> = {
  ".pdf": PDF_MIME_TYPE,
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
};

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

function generatedSyllabusStorageKey(extension: string): string {
  return `course-syllabi/${randomUUID()}${extension}`;
}

function originalFileBaseName(name: string): string {
  return path.basename(name.replace(/\\/gu, "/")).trim();
}

async function validatedSyllabusFile(
  file: CourseSyllabusUploadFile | null | undefined,
): Promise<ValidatedSyllabusFile> {
  if (!file) {
    throw new CourseOperationError("请上传教学大纲 PDF、DOCX 或 DOC。", 400);
  }

  const originalName = originalFileBaseName(file.name);
  if (!originalName) {
    throw new CourseOperationError("教学大纲文件名不能为空。", 400);
  }

  const extension = path.extname(originalName).toLowerCase();
  const mimeType = SYLLABUS_MIME_TYPES[extension];
  if (!mimeType) {
    throw new CourseOperationError(
      "教学大纲仅支持 PDF、DOCX 和 DOC 文件。",
      400,
    );
  }
  if (
    file.type &&
    file.type !== mimeType &&
    file.type !== "application/octet-stream"
  ) {
    throw new CourseOperationError("教学大纲文件类型与扩展名不匹配。", 400);
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

  if (extension === ".pdf") {
    if (!data.subarray(0, PDF_HEADER.length).equals(PDF_HEADER)) {
      throw new CourseOperationError("教学大纲文件内容不是合法 PDF。", 400);
    }
    await assertReadablePdf(data);
  } else {
    try {
      const extracted = await extractQuestionFile(
        new File([new Uint8Array(data)], originalName),
      );
      if (extracted.format !== extension.slice(1).toUpperCase())
        throw new Error("Invalid Word format");
    } catch {
      throw new CourseOperationError(
        "教学大纲 Word 文件已损坏或没有可提取文本。",
        400,
      );
    }
  }

  return {
    originalName,
    mimeType,
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
    coverKey: template.coverKey,
    isBuiltin: template.isBuiltin,
    isActive: template.isActive,
    courseCount: template._count.courses,
  };
}

function courseSnapshot(item: TeacherCourseListItem): AuditConfigSnapshot {
  return {
    questionCategoryId: item.questionCategoryId,
    questionCategoryName: item.questionCategoryName,
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
    coverKey: courseCoverOf(template.coverKey).key,
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
      coverKey: courseCoverOf(record.template.coverKey).key,
      isBuiltin: record.template.isBuiltin,
    },
    questionCategoryId: record.questionCategoryId,
    questionCategoryName: record.questionCategory.name,
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

export async function listAdminCourseTemplates(
  actorId: string,
): Promise<CourseTemplateView[]> {
  const schoolId = await requireUserSchoolId(actorId);
  return (await loadCourseTemplates(schoolId)).map(templateViewFromRecord);
}

export async function getAdminCourseTemplate(
  actorId: string,
  templateId: string,
): Promise<CourseTemplateView> {
  const schoolId = await requireUserSchoolId(actorId);
  const template = await findCourseTemplateById(templateId, schoolId);
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
      const schoolId = await requireUserSchoolId(actorId, transaction);
      const template = await transaction.courseTemplate.create({
        data: {
          schoolId,
          code: input.code,
          name: input.name,
          description: input.description,
          version: input.version,
          coverKey: input.coverKey,
          isBuiltin: false,
          isActive: true,
        },
        select: {
          id: true,
          schoolId: true,
          code: true,
          name: true,
          description: true,
          version: true,
          coverKey: true,
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
    const schoolId = await requireUserSchoolId(actorId, transaction);
    const before = await findCourseTemplateById(
      templateId,
      schoolId,
      transaction,
    );
    if (!before) {
      throw new ResourceNotFoundError("课程模板不存在");
    }

    const nextName = input.name;
    const nextDescription = input.description;
    const nextVersion = input.version;
    const nextCoverKey = input.coverKey ?? before.coverKey;
    const changed =
      nextName !== before.name ||
      nextDescription !== before.description ||
      nextVersion !== before.version ||
      nextCoverKey !== before.coverKey;

    if (!changed) {
      return templateViewFromRecord(before);
    }

    const after = await transaction.courseTemplate.update({
      where: { id: templateId },
      data: {
        name: nextName,
        description: nextDescription,
        version: nextVersion,
        coverKey: nextCoverKey,
      },
      select: {
        id: true,
        schoolId: true,
        code: true,
        name: true,
        description: true,
        version: true,
        coverKey: true,
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
    const schoolId = await requireUserSchoolId(actorId, transaction);
    const before = await findCourseTemplateById(
      templateId,
      schoolId,
      transaction,
    );
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
        schoolId: true,
        code: true,
        name: true,
        description: true,
        version: true,
        coverKey: true,
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

export async function listTeacherCourseTemplates(
  teacherId: string,
): Promise<CourseTemplateView[]> {
  const schoolId = await requireUserSchoolId(teacherId);
  return (await loadCourseTemplates(schoolId, prisma, true)).map(
    templateViewFromRecord,
  );
}

export async function listTeacherQuestionCourseCategories(teacherId: string) {
  return listQuestionCourseCategories(teacherId, true);
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
    dependencies.storageKeyFactory?.() ??
    generatedSyllabusStorageKey(
      path.extname(upload.originalName).toLowerCase(),
    );

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

/**
 * 课程号由课程目录（QuestionCourseCategory.courseNo）决定。
 * 目录未维护课程号时允许教师手填；目录已维护时必须以目录为准。
 *
 * allowLegacyMismatch 只用于编辑场景中「分类与课程号都未改动」的存量课程，
 * 避免强制改写历史数据，但任何一次改号或换分类都必须回到目录值。
 */
function assertCourseNoMatchesCatalog(
  categoryCourseNo: string | null,
  courseNo: string,
  options: { allowLegacyMismatch?: boolean } = {},
) {
  if (!categoryCourseNo) return;
  if (courseNo === categoryCourseNo) return;
  if (options.allowLegacyMismatch) return;
  throw new CourseOperationError(
    `课程号必须与课程目录一致：该课程在目录中的课程号是 ${categoryCourseNo}`,
    400,
  );
}

export async function createTeacherCourse(
  teacherId: string,
  input: CreateCourseData,
  context: AuditRequestContext,
): Promise<TeacherCourseDetail> {
  try {
    const course = await prisma.$transaction(async (transaction) => {
      const schoolId = await requireUserSchoolId(teacherId, transaction);
      const template = await resolveActiveCourseTemplateForSchool(
        input.templateId,
        schoolId,
        transaction,
      );
      if (!template) {
        throw new ResourceNotFoundError("课程模板不存在或已停用");
      }
      const questionCategory = await requireActiveQuestionCourseCategory(
        input.questionCategoryId,
        teacherId,
        transaction,
      );
      assertCourseNoMatchesCatalog(questionCategory.courseNo, input.courseNo);
      const created = await transaction.course.create({
        data: {
          templateId: template.id,
          questionCategoryId: questionCategory.id,
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
          questionCategoryId: true,
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
              coverKey: true,
              isBuiltin: true,
            },
          },
          questionCategory: { select: { name: true } },
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
    const nextTemplateId = input.templateId ?? before.templateId;
    const templateChanged = nextTemplateId !== before.templateId;
    const changed =
      input.courseNo !== before.courseNo ||
      input.questionCategoryId !== before.questionCategoryId ||
      input.term !== before.term ||
      input.name !== before.name ||
      input.description !== before.description ||
      templateChanged;

    if (!changed) {
      const classrooms = await loadTeacherClassroomsForCourseLink(
        teacherId,
        transaction,
      );
      return courseDetailFromRecords(before, classrooms);
    }

    if (templateChanged) {
      const schoolId = await requireUserSchoolId(teacherId, transaction);
      const template = await resolveActiveCourseTemplateForSchool(
        nextTemplateId,
        schoolId,
        transaction,
      );
      if (!template) {
        throw new CourseOperationError("该课程模板不可用或已停用", 400);
      }
    }

    const questionCategory = await requireActiveQuestionCourseCategory(
      input.questionCategoryId,
      teacherId,
      transaction,
    );

    // 只改名称/学期/描述等字段时，不动存量的课程号不一致；
    // 一旦改课程号或换分类，就必须回到目录值。
    assertCourseNoMatchesCatalog(questionCategory.courseNo, input.courseNo, {
      allowLegacyMismatch:
        input.questionCategoryId === before.questionCategoryId &&
        input.courseNo === before.courseNo,
    });

    try {
      await transaction.course.update({
        where: { id: courseId },
        data: {
          templateId: nextTemplateId,
          courseNo: input.courseNo,
          questionCategoryId: questionCategory.id,
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
  writeAuditLog?: typeof writeGovernanceAuditLog;
}

export async function deleteTeacherCourse(
  teacherId: string,
  courseId: string,
  context: AuditRequestContext,
  dependencies: CourseDeletionDependencies = {},
): Promise<TeacherCourseDeletionResult> {
  const writeAuditLog = dependencies.writeAuditLog ?? writeGovernanceAuditLog;
  let result: TeacherCourseDeletionResult | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await prisma.$transaction(
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
          const deletedAt = new Date();
          const snapshot = courseDeletionSnapshot(course, deletedAt);

          await transaction.course.update({
            where: { id: courseId },
            data: {
              status: CourseStatus.ARCHIVED,
              archivedAt: deletedAt,
            },
          });

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
              status: CourseStatus.ARCHIVED,
              historyPreserved: true,
            },
            context,
          });

          return {
            id: course.id,
            name: course.name,
            courseNo: course.courseNo,
            term: course.term,
            deletedAt,
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

  if (!result) {
    throw new CourseOperationError("课程删除冲突，请稍后重试。", 409);
  }
  return result;
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
