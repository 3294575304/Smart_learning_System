import {
  AuditAction,
  AuditTargetType,
  ClassroomStatus,
  CourseFileKind,
  MembershipStatus,
  Prisma,
  Role,
  StudentImportBatchStatus,
  StudentImportExecutionStatus,
  StudentImportPreviewStatus,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { hashPasswordCore } from "@/services/auth/password-core";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type {
  AuditConfigSnapshot,
  AuditRequestContext,
} from "@/services/audit/types";
import { STUDENT_ROSTER_FILE_KEY } from "@/services/course-files/config";
import {
  findLatestCourseFileVersion,
  findTeacherCourseFileVersionById,
  type CourseFileVersionRecord,
} from "@/services/course-files/repository";
import type { StudentRosterExtension } from "@/services/course-files/config";
import {
  inferHeaderRow,
  resolveStudentImportMappings,
  sourceColumnsFromHeaderRow,
} from "@/services/student-imports/mapping";
import {
  ParsedSpreadsheetCell,
  ParsedSpreadsheetMergedRange,
  ParsedSpreadsheetRow,
  ParsedSpreadsheetSheet,
  columnNameFromIndex,
  parseSpreadsheetWorkbook,
} from "@/services/student-imports/spreadsheet-parser";
import { StudentImportOperationError } from "@/services/student-imports/errors";
import type { StudentImportPreviewRequestData } from "@/services/student-imports/schemas";
import {
  STUDENT_IMPORT_MAPPING_VERSION,
  requiredStudentImportFields,
  stableStudentImportFields,
  studentImportFieldLabels,
  type StudentImportBatchView,
  type StudentImportExecutionAction,
  type StudentImportExecutionResult,
  type StudentImportExecutionRowResult,
  type StudentImportExecutionSummary,
  type StudentImportField,
  type StudentImportFieldMapping,
  type StudentImportIssue,
  type StudentImportMappingConfig,
  type StudentImportPreviewPage,
  type StudentImportPreviewRowView,
  type StudentImportSummary,
} from "@/services/student-imports/types";
import { getStorageService } from "@/services/storage";
import type { StorageService } from "@/services/storage/types";

const MAX_STORED_FIELD_LENGTHS: Record<
  "academicTerm" | "className" | "courseNo" | "studentName" | "studentNo",
  number
> = {
  academicTerm: 50,
  courseNo: 50,
  studentNo: 50,
  studentName: 100,
  className: 100,
};

const fieldMaxLengths: Partial<Record<StudentImportField, number>> = {
  academicTerm: 50,
  courseNo: 50,
  studentNo: 50,
  studentName: 100,
  className: 100,
  email: 254,
  phone: 30,
  gradeMark: 50,
  finalGrade: 50,
  specialReason: 100,
  gradeType: 100,
  remark: 500,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE_PATTERN = /^\+?[\d\s\-()（）]{5,30}$/u;
const SCIENTIFIC_NOTATION_PATTERN = /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/iu;

const batchSelect = Prisma.validator<Prisma.StudentImportBatchSelect>()({
  id: true,
  courseId: true,
  classroomId: true,
  createdById: true,
  sourceFileVersionId: true,
  status: true,
  idempotencyKey: true,
  sourceFileName: true,
  sourceFileChecksum: true,
  sourceFileMimeType: true,
  sourceFileSizeBytes: true,
  sourceSheetName: true,
  mappingConfig: true,
  previewSummary: true,
  totalRows: true,
  previewRows: true,
  newUserRows: true,
  existingUserRows: true,
  alreadyEnrolledRows: true,
  courseMismatchRows: true,
  invalidRows: true,
  duplicateRows: true,
  importedRows: true,
  failedRows: true,
  previewedAt: true,
  confirmedAt: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});

const rowSelect = Prisma.validator<Prisma.StudentImportRowSelect>()({
  id: true,
  rowNumber: true,
  previewStatus: true,
  executionStatus: true,
  rowKey: true,
  sourceRow: true,
  academicTerm: true,
  courseNo: true,
  studentNo: true,
  studentName: true,
  className: true,
  errorCode: true,
  errorDetail: true,
  matchedUserId: true,
  matchedMembershipId: true,
  createdUserId: true,
  createdMembershipId: true,
  processedAt: true,
});

const targetClassroomSelect = Prisma.validator<Prisma.ClassroomSelect>()({
  id: true,
  name: true,
  teacherId: true,
  courseId: true,
  status: true,
  course: {
    select: {
      id: true,
      name: true,
      courseNo: true,
      term: true,
      teacherId: true,
    },
  },
});

const executionBatchSelect =
  Prisma.validator<Prisma.StudentImportBatchSelect>()({
    id: true,
    courseId: true,
    classroomId: true,
    createdById: true,
    sourceFileVersionId: true,
    status: true,
    idempotencyKey: true,
    sourceFileName: true,
    sourceFileChecksum: true,
    sourceFileMimeType: true,
    sourceFileSizeBytes: true,
    sourceSheetName: true,
    mappingConfig: true,
    previewSummary: true,
    totalRows: true,
    previewRows: true,
    newUserRows: true,
    existingUserRows: true,
    alreadyEnrolledRows: true,
    courseMismatchRows: true,
    invalidRows: true,
    duplicateRows: true,
    importedRows: true,
    failedRows: true,
    previewedAt: true,
    confirmedAt: true,
    startedAt: true,
    completedAt: true,
    createdAt: true,
    updatedAt: true,
    course: {
      select: {
        id: true,
        teacherId: true,
        courseNo: true,
        term: true,
        name: true,
      },
    },
    classroom: {
      select: {
        id: true,
        teacherId: true,
        courseId: true,
        status: true,
        name: true,
      },
    },
    sourceFileVersion: {
      select: {
        id: true,
        courseId: true,
        classroomId: true,
        fileKind: true,
        fileKey: true,
        checksumSha256: true,
      },
    },
  });

type StudentImportBatchRecord = Prisma.StudentImportBatchGetPayload<{
  select: typeof batchSelect;
}>;

type StudentImportRowRecord = Prisma.StudentImportRowGetPayload<{
  select: typeof rowSelect;
}>;

type StudentImportExecutionBatchRecord = Prisma.StudentImportBatchGetPayload<{
  select: typeof executionBatchSelect;
}>;

type TargetClassroomRecord = Prisma.ClassroomGetPayload<{
  select: typeof targetClassroomSelect;
}>;

interface StudentImportPreviewDependencies {
  storage?: StorageService;
  logger?: Pick<Console, "error">;
  now?: () => Date;
}

interface StudentImportExecutionDependencies {
  now?: () => Date;
  passwordGenerator?: () => string;
  passwordHasher?: (password: string) => Promise<string>;
}

type DatabaseClient = typeof prisma | Prisma.TransactionClient;

interface StudentImportActor {
  id: string;
  role: typeof Role.ADMIN | typeof Role.TEACHER;
}

interface ImportExecutionFailure {
  code: string;
  message: string;
  retryable: boolean;
  rowNumber?: number;
  status?: 400 | 409 | 500;
}

class StudentImportExecutionFailureError extends StudentImportOperationError {
  constructor(readonly failure: ImportExecutionFailure) {
    super(failure.message, failure.status ?? 409);
    this.name = "StudentImportExecutionFailureError";
  }
}

interface PreparedPreviewRow {
  rowNumber: number;
  rowKey: string;
  previewStatus: StudentImportPreviewStatus;
  academicTerm: string;
  courseNo: string;
  studentNo: string;
  studentName: string;
  className: string;
  sourceRow: Prisma.InputJsonObject;
  issues: StudentImportIssue[];
  mappedValues: Partial<Record<StudentImportField, string>>;
  matchedUserId: string | null;
  matchedMembershipId: string | null;
}

interface ResolvedTarget {
  course: {
    id: string;
    name: string;
    courseNo: string;
    term: string;
  };
  classroom: {
    id: string;
    name: string;
  };
}

interface UserMatchRecord {
  id: string;
  role: Role;
  email: string | null;
  profile: {
    studentNo: string | null;
    phone: string | null;
  } | null;
  classMemberships: Array<{
    id: string;
    status: MembershipStatus;
  }>;
}

const userMatchSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  role: true,
  email: true,
  profile: { select: { studentNo: true, phone: true } },
  classMemberships: {
    select: { id: true, status: true },
  },
});

type SelectedUserMatchRecord = Prisma.UserGetPayload<{
  select: typeof userMatchSelect;
}>;

const SERIALIZABLE_RETRY_LIMIT = 3;

function generateInitialPassword(): string {
  return `Zx${randomBytes(12).toString("base64url")}7a`;
}

function isRetryablePrismaError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2028")
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function serializableImportTransaction<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (isRetryablePrismaError(error) && attempt < SERIALIZABLE_RETRY_LIMIT) {
        continue;
      }
      throw error;
    }
  }

  throw new StudentImportExecutionFailureError({
    code: "SERIALIZABLE_RETRY_EXHAUSTED",
    message: "学生名单导入遇到并发写入冲突，请重试。",
    retryable: true,
    status: 409,
  });
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Buffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return `{${entries
    .map(
      ([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`,
    )
    .join(",")}}`;
}

function inputJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function inputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function issueArrayFromJson(
  value: Prisma.JsonValue | null,
): StudentImportIssue[] {
  const object = jsonObject(value);
  const issues = object.issues;
  return Array.isArray(issues) ? (issues as StudentImportIssue[]) : [];
}

function mappedValuesFromJson(
  value: Prisma.JsonValue | null,
): Partial<Record<StudentImportField, string>> {
  const object = jsonObject(value);
  const mappedValues = object.mappedValues;
  if (
    !mappedValues ||
    typeof mappedValues !== "object" ||
    Array.isArray(mappedValues)
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(mappedValues as Record<string, unknown>).filter(
      ([, entryValue]) => typeof entryValue === "string",
    ),
  ) as Partial<Record<StudentImportField, string>>;
}

function sourceValuesFromJson(
  value: Prisma.JsonValue | null,
): StudentImportPreviewRowView["sourceValues"] {
  const object = jsonObject(value);
  const cells = object.cells;
  if (!Array.isArray(cells)) return [];
  return cells
    .filter((cell): cell is Record<string, unknown> => {
      return cell !== null && typeof cell === "object" && !Array.isArray(cell);
    })
    .map((cell) => ({
      columnIndex:
        typeof cell.columnIndex === "number" &&
        Number.isSafeInteger(cell.columnIndex)
          ? cell.columnIndex
          : 0,
      columnName: typeof cell.columnName === "string" ? cell.columnName : "",
      header: typeof cell.header === "string" ? cell.header : "",
      value: typeof cell.value === "string" ? cell.value : "",
      hasFormula: cell.hasFormula === true,
    }));
}

function sourceFormatFromFile(
  file: CourseFileVersionRecord,
): StudentRosterExtension {
  const metadata = jsonObject(file.metadata);
  const detectedFormat = metadata.detectedFormat;
  if (
    detectedFormat === "csv" ||
    detectedFormat === "xls" ||
    detectedFormat === "xlsx"
  ) {
    return detectedFormat;
  }

  const extension = path.extname(file.originalFileName).toLowerCase();
  if (extension === ".csv" || extension === ".xls" || extension === ".xlsx") {
    return extension.slice(1) as StudentRosterExtension;
  }

  throw new StudentImportOperationError(
    "学生名单仅支持 XLS、XLSX 或 CSV 文件。",
    400,
  );
}

async function readSourceFile(
  file: CourseFileVersionRecord,
  dependencies: StudentImportPreviewDependencies,
): Promise<Buffer> {
  const storage = dependencies.storage ?? getStorageService();
  const logger = dependencies.logger ?? console;
  try {
    const data = await storage.read(file.storageKey);
    const checksum = sha256Buffer(data);
    if (checksum !== file.checksumSha256) {
      throw new StudentImportOperationError(
        "学生名单文件内容与版本记录不一致，请重新上传后再预览。",
        409,
      );
    }
    return data;
  } catch (error: unknown) {
    if (error instanceof StudentImportOperationError) {
      throw error;
    }
    logger.error("Failed to read student import source file", {
      fileId: file.id,
      storageKey: file.storageKey,
    });
    throw new StudentImportOperationError(
      "学生名单文件暂时无法读取，请稍后重试。",
      500,
    );
  }
}

async function resolvePreviewTarget(
  teacherId: string,
  file: CourseFileVersionRecord,
  requestedClassroomId?: string,
): Promise<ResolvedTarget> {
  if (
    file.fileKind !== CourseFileKind.IMPORT_SOURCE ||
    file.fileKey !== STUDENT_ROSTER_FILE_KEY
  ) {
    throw new ResourceNotFoundError("学生名单文件不存在");
  }

  if (file.classroom) {
    if (requestedClassroomId && requestedClassroomId !== file.classroom.id) {
      throw new StudentImportOperationError(
        "目标班级与所选名单文件不一致。",
        400,
      );
    }
    const classroom = await prisma.classroom.findFirst({
      where: { id: file.classroom.id, teacherId },
      select: targetClassroomSelect,
    });
    return targetFromClassroom(classroom);
  }

  if (!file.course) {
    throw new ResourceNotFoundError("学生名单文件不存在");
  }

  if (!requestedClassroomId) {
    throw new StudentImportOperationError("请选择目标班级后再预览名单。", 400);
  }

  const classroom = await prisma.classroom.findFirst({
    where: { id: requestedClassroomId, teacherId },
    select: targetClassroomSelect,
  });
  const target = targetFromClassroom(classroom);
  if (target.course.id !== file.course.id) {
    throw new StudentImportOperationError(
      "目标班级未关联到所选名单文件所属课程。",
      400,
    );
  }
  return target;
}

function targetFromClassroom(
  classroom: TargetClassroomRecord | null,
): ResolvedTarget {
  if (!classroom) {
    throw new ResourceNotFoundError("目标班级不存在");
  }

  if (classroom.status !== ClassroomStatus.ACTIVE) {
    throw new StudentImportOperationError(
      "目标班级已关闭，不能导入名单。",
      409,
    );
  }

  if (!classroom.course) {
    throw new StudentImportOperationError(
      "目标班级尚未关联课程，不能导入名单。",
      409,
    );
  }

  return {
    course: {
      id: classroom.course.id,
      name: classroom.course.name,
      courseNo: classroom.course.courseNo,
      term: classroom.course.term,
    },
    classroom: {
      id: classroom.id,
      name: classroom.name,
    },
  };
}

function selectedSheetFromWorkbook(
  sheets: readonly ParsedSpreadsheetSheet[],
  sheetName?: string,
): ParsedSpreadsheetSheet {
  const sheet = sheetName
    ? sheets.find((item) => item.name === sheetName)
    : sheets.find((item) => !item.hidden);

  if (!sheet) {
    throw new StudentImportOperationError("所选工作表不存在或不受支持。", 400);
  }

  if (sheet.hidden) {
    throw new StudentImportOperationError("不支持导入隐藏工作表。", 400);
  }

  if (sheet.rows.length === 0) {
    throw new StudentImportOperationError(
      "所选工作表没有可解析的数据行。",
      400,
    );
  }

  return sheet;
}

function normalizeFieldValue(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\uFEFF/gu, "")
    .trim();
}

function normalizeEmail(value: string): string {
  return normalizeFieldValue(value).toLowerCase();
}

function normalizeCourseNo(value: string): string {
  return normalizeFieldValue(value).toUpperCase();
}

function storageText(
  value: string | undefined,
  field: keyof typeof MAX_STORED_FIELD_LENGTHS,
): string {
  const normalized = normalizeFieldValue(value ?? "");
  return normalized.slice(0, MAX_STORED_FIELD_LENGTHS[field]);
}

function cellByColumn(
  row: ParsedSpreadsheetRow,
): Map<number, ParsedSpreadsheetCell> {
  return new Map(row.cells.map((cell) => [cell.columnIndex, cell]));
}

function mappedCell(
  rowCells: Map<number, ParsedSpreadsheetCell>,
  mapping: StudentImportFieldMapping,
): ParsedSpreadsheetCell | null {
  return rowCells.get(mapping.sourceColumnIndex) ?? null;
}

function isRowBlank(row: ParsedSpreadsheetRow): boolean {
  return row.cells.every((cell) => normalizeFieldValue(cell.value) === "");
}

function mergedRangesForRow(
  rowNumber: number,
  ranges: readonly ParsedSpreadsheetMergedRange[],
): ParsedSpreadsheetMergedRange[] {
  return ranges.filter(
    (range) => rowNumber >= range.startRow && rowNumber <= range.endRow,
  );
}

function issue(
  level: StudentImportIssue["level"],
  code: string,
  message: string,
  options: Omit<StudentImportIssue, "code" | "level" | "message"> = {},
): StudentImportIssue {
  return { level, code, message, ...options };
}

function fieldMappingByField(
  mappings: readonly StudentImportFieldMapping[],
): Map<StudentImportField, StudentImportFieldMapping> {
  return new Map(mappings.map((mapping) => [mapping.field, mapping]));
}

function buildMappedValues(
  row: ParsedSpreadsheetRow,
  mappings: readonly StudentImportFieldMapping[],
): Partial<Record<StudentImportField, string>> {
  const rowCells = cellByColumn(row);
  const values: Partial<Record<StudentImportField, string>> = {};
  for (const mapping of mappings) {
    values[mapping.field] = normalizeFieldValue(
      mappedCell(rowCells, mapping)?.value ?? "",
    );
  }
  return values;
}

function rowFormulaIssues(
  row: ParsedSpreadsheetRow,
  mappings: readonly StudentImportFieldMapping[],
): StudentImportIssue[] {
  const mappingByColumn = new Map(
    mappings.map((mapping) => [mapping.sourceColumnIndex, mapping]),
  );
  return row.cells
    .filter((cell) => cell.hasFormula)
    .map((cell) => {
      const mapping = mappingByColumn.get(cell.columnIndex);
      return issue(
        "error",
        "FORMULA_CELL",
        `${cell.columnName}${row.rowNumber} 包含公式，请改为静态文本。`,
        {
          field: mapping?.field ?? "row",
          sourceHeader: mapping?.sourceHeader,
          sourceColumnIndex: cell.columnIndex,
          sourceColumnName: cell.columnName,
        },
      );
    });
}

function rowMergedCellIssues(
  row: ParsedSpreadsheetRow,
  ranges: readonly ParsedSpreadsheetMergedRange[],
): StudentImportIssue[] {
  return mergedRangesForRow(row.rowNumber, ranges).map((range) =>
    issue(
      "error",
      "MERGED_CELL",
      `第 ${row.rowNumber} 行位于合并单元格 ${range.ref} 内，请取消合并后重新上传。`,
      { field: "row" },
    ),
  );
}

function validateMappedValues(
  row: ParsedSpreadsheetRow,
  mappedValues: Partial<Record<StudentImportField, string>>,
  mappings: readonly StudentImportFieldMapping[],
  target: ResolvedTarget,
): StudentImportIssue[] {
  const issues: StudentImportIssue[] = [];
  const mappingByField = fieldMappingByField(mappings);
  const rowCells = cellByColumn(row);

  for (const field of requiredStudentImportFields) {
    if (!mappedValues[field]) {
      const mapping = mappingByField.get(field);
      issues.push(
        issue(
          "error",
          "MISSING_REQUIRED_FIELD",
          `${studentImportFieldLabels[field]} 不能为空。`,
          {
            field,
            sourceHeader: mapping?.sourceHeader,
            sourceColumnIndex: mapping?.sourceColumnIndex,
            sourceColumnName: mapping?.sourceColumnName,
          },
        ),
      );
    }
  }

  for (const mapping of mappings) {
    const value = mappedValues[mapping.field] ?? "";
    const maxLength = fieldMaxLengths[mapping.field];
    if (maxLength && value.length > maxLength) {
      issues.push(
        issue(
          "error",
          "FIELD_TOO_LONG",
          `${studentImportFieldLabels[mapping.field]} 不能超过 ${maxLength} 个字符。`,
          {
            field: mapping.field,
            sourceHeader: mapping.sourceHeader,
            sourceColumnIndex: mapping.sourceColumnIndex,
            sourceColumnName: mapping.sourceColumnName,
          },
        ),
      );
    }

    const cell = rowCells.get(mapping.sourceColumnIndex);
    if (
      mapping.field === "studentNo" &&
      value &&
      (cell?.type === "number" || SCIENTIFIC_NOTATION_PATTERN.test(value))
    ) {
      issues.push(
        issue(
          "error",
          "STUDENT_NO_NOT_TEXT",
          "学号必须按文本读取，不能使用数字或科学计数法。",
          {
            field: "studentNo",
            sourceHeader: mapping.sourceHeader,
            sourceColumnIndex: mapping.sourceColumnIndex,
            sourceColumnName: mapping.sourceColumnName,
          },
        ),
      );
    }
  }

  const email = mappedValues.email ? normalizeEmail(mappedValues.email) : "";
  if (email && !EMAIL_PATTERN.test(email)) {
    const mapping = mappingByField.get("email");
    issues.push(
      issue("error", "INVALID_EMAIL", "邮箱格式无效。", {
        field: "email",
        sourceHeader: mapping?.sourceHeader,
        sourceColumnIndex: mapping?.sourceColumnIndex,
        sourceColumnName: mapping?.sourceColumnName,
      }),
    );
  }

  const phone = mappedValues.phone
    ? normalizeFieldValue(mappedValues.phone)
    : "";
  if (phone && !PHONE_PATTERN.test(phone)) {
    const mapping = mappingByField.get("phone");
    issues.push(
      issue("error", "INVALID_PHONE", "联系方式格式无效。", {
        field: "phone",
        sourceHeader: mapping?.sourceHeader,
        sourceColumnIndex: mapping?.sourceColumnIndex,
        sourceColumnName: mapping?.sourceColumnName,
      }),
    );
  }

  const term = mappedValues.academicTerm
    ? normalizeFieldValue(mappedValues.academicTerm)
    : "";
  if (term && term !== target.course.term) {
    issues.push(
      issue(
        "warning",
        "COURSE_TERM_MISMATCH",
        "学年学期与目标课程不一致，需要教师确认。",
        { field: "academicTerm" },
      ),
    );
  }

  const courseNo = mappedValues.courseNo
    ? normalizeCourseNo(mappedValues.courseNo)
    : "";
  if (courseNo && courseNo !== normalizeCourseNo(target.course.courseNo)) {
    issues.push(
      issue(
        "warning",
        "COURSE_NO_MISMATCH",
        "课程号与目标课程不一致，需要教师确认。",
        { field: "courseNo" },
      ),
    );
  }

  return issues;
}

function sourceRowPayload(
  sheet: ParsedSpreadsheetSheet,
  headerRow: ParsedSpreadsheetRow,
  row: ParsedSpreadsheetRow,
  mappings: readonly StudentImportFieldMapping[],
  mappedValues: Partial<Record<StudentImportField, string>>,
): Prisma.InputJsonObject {
  const headerCells = cellByColumn(headerRow);
  const rowCells = cellByColumn(row);
  const maxColumnIndex = Math.max(
    ...headerRow.cells.map((cell) => cell.columnIndex),
    ...row.cells.map((cell) => cell.columnIndex),
    0,
  );
  const mappedColumnIndexes = new Set(
    mappings.map((mapping) => mapping.sourceColumnIndex),
  );

  const cells = Array.from({ length: maxColumnIndex + 1 }, (_, columnIndex) => {
    const header = headerCells.get(columnIndex)?.value.trim() ?? "";
    const cell = rowCells.get(columnIndex);
    return {
      columnIndex,
      columnName: columnNameFromIndex(columnIndex),
      header,
      value: normalizeFieldValue(cell?.value ?? ""),
      hasFormula: cell?.hasFormula ?? false,
      mapped: mappedColumnIndexes.has(columnIndex),
    };
  });

  return inputJsonObject({
    version: 1,
    sheetName: sheet.name,
    sheetIndex: sheet.index,
    rowNumber: row.rowNumber,
    cells,
    mappedValues,
  });
}

function baseRowKey(
  rowNumber: number,
  mappedValues: Partial<Record<StudentImportField, string>>,
  sourceRow: Prisma.InputJsonObject,
): string {
  const studentNo = mappedValues.studentNo
    ? normalizeFieldValue(mappedValues.studentNo)
    : "";
  if (studentNo) {
    return `studentNo:${sha256Text(studentNo)}`;
  }
  const email = mappedValues.email ? normalizeEmail(mappedValues.email) : "";
  if (email) {
    return `email:${sha256Text(email)}`;
  }
  return `row:${rowNumber}:${sha256Text(stableJson(sourceRow)).slice(0, 48)}`;
}

function duplicateIssuesForRows(
  rows: PreparedPreviewRow[],
): Map<number, StudentImportIssue[]> {
  const issuesByRowNumber = new Map<number, StudentImportIssue[]>();

  for (const field of stableStudentImportFields) {
    const groups = new Map<string, PreparedPreviewRow[]>();
    for (const row of rows) {
      const value =
        field === "email"
          ? normalizeEmail(row.mappedValues.email ?? "")
          : normalizeFieldValue(row.mappedValues[field] ?? "");
      if (!value) continue;
      const existing = groups.get(value) ?? [];
      existing.push(row);
      groups.set(value, existing);
    }

    for (const group of groups.values()) {
      if (group.length <= 1) continue;
      const relatedRows = group
        .map((row) => row.rowNumber)
        .sort((a, b) => a - b);
      for (const row of group) {
        const rowIssues = issuesByRowNumber.get(row.rowNumber) ?? [];
        rowIssues.push(
          issue(
            "error",
            field === "email"
              ? "DUPLICATE_EMAIL_IN_FILE"
              : "DUPLICATE_STUDENT_NO_IN_FILE",
            `${studentImportFieldLabels[field]} 在同一文件内重复。`,
            { field, relatedRows },
          ),
        );
        issuesByRowNumber.set(row.rowNumber, rowIssues);
      }
    }
  }

  return issuesByRowNumber;
}

async function loadUserMatches(
  rows: readonly PreparedPreviewRow[],
  classroomId: string,
): Promise<{
  byStudentNo: Map<string, UserMatchRecord>;
  byEmail: Map<string, UserMatchRecord>;
}> {
  const studentNos = Array.from(
    new Set(
      rows
        .map((row) => normalizeFieldValue(row.mappedValues.studentNo ?? ""))
        .filter(Boolean),
    ),
  );
  const emails = Array.from(
    new Set(
      rows
        .map((row) => normalizeEmail(row.mappedValues.email ?? ""))
        .filter(Boolean),
    ),
  );

  if (studentNos.length === 0 && emails.length === 0) {
    return { byStudentNo: new Map(), byEmail: new Map() };
  }

  const matchConditions: Prisma.UserWhereInput[] = [];
  if (studentNos.length > 0) {
    matchConditions.push({
      profile: { is: { studentNo: { in: studentNos } } },
    });
  }
  if (emails.length > 0) {
    matchConditions.push(
      ...emails.map((email): Prisma.UserWhereInput => ({
        email: { equals: email, mode: "insensitive" },
      })),
    );
  }

  const users = await prisma.user.findMany({
    where: { OR: matchConditions },
    select: {
      ...userMatchSelect,
      classMemberships: {
        where: { classroomId },
        select: { id: true, status: true },
      },
    },
  });

  const byStudentNo = new Map<string, UserMatchRecord>();
  const byEmail = new Map<string, UserMatchRecord>();
  for (const user of users as SelectedUserMatchRecord[]) {
    if (user.profile?.studentNo) {
      byStudentNo.set(normalizeFieldValue(user.profile.studentNo), user);
    }
    if (user.email) {
      byEmail.set(normalizeEmail(user.email), user);
    }
  }

  return { byStudentNo, byEmail };
}

function applyUserMatches(
  rows: PreparedPreviewRow[],
  matches: {
    byStudentNo: Map<string, UserMatchRecord>;
    byEmail: Map<string, UserMatchRecord>;
  },
): PreparedPreviewRow[] {
  return rows.map((row) => {
    const studentNo = normalizeFieldValue(row.mappedValues.studentNo ?? "");
    const email = normalizeEmail(row.mappedValues.email ?? "");
    const byStudentNo = studentNo ? matches.byStudentNo.get(studentNo) : null;
    const emailMatch = email ? matches.byEmail.get(email) : null;
    const issues = [...row.issues];
    let matchedUserId = row.matchedUserId;
    let matchedMembershipId = row.matchedMembershipId;

    if (byStudentNo) {
      matchedUserId = byStudentNo.id;
      if (byStudentNo.role !== Role.STUDENT) {
        issues.push(
          issue(
            "error",
            "STUDENT_NO_ACCOUNT_ROLE_CONFLICT",
            "该学号已关联非学生账号，请先由管理员处理账号归属。",
            { field: "studentNo" },
          ),
        );
      }
      const activeMembership = byStudentNo.classMemberships.find(
        (membership) => membership.status === MembershipStatus.ACTIVE,
      );
      matchedMembershipId = activeMembership?.id ?? null;
      if (activeMembership) {
        issues.push(
          issue(
            "warning",
            "ALREADY_ENROLLED",
            "该学生已经在目标班级中，正式导入时会跳过。",
            { field: "studentNo" },
          ),
        );
      }
      if (emailMatch && emailMatch.id !== byStudentNo.id) {
        issues.push(
          issue(
            "error",
            "EMAIL_ACCOUNT_CONFLICT",
            "该邮箱已被系统账号使用，不能用于创建新的学生账号。",
            { field: "email" },
          ),
        );
      }
    } else if (emailMatch) {
      issues.push(
        issue(
          "error",
          "EMAIL_ACCOUNT_CONFLICT",
          "该邮箱已被系统账号使用，不能用于创建新的学生账号。",
          { field: "email" },
        ),
      );
    }

    return {
      ...row,
      issues,
      matchedUserId,
      matchedMembershipId,
    };
  });
}

function previewStatusForRow(
  row: PreparedPreviewRow,
): StudentImportPreviewStatus {
  if (row.issues.some((rowIssue) => rowIssue.code === "EMPTY_ROW")) {
    return StudentImportPreviewStatus.PENDING;
  }

  const hasError = row.issues.some((rowIssue) => rowIssue.level === "error");
  if (hasError) {
    return row.issues.some((rowIssue) => rowIssue.code.startsWith("DUPLICATE_"))
      ? StudentImportPreviewStatus.DUPLICATE
      : StudentImportPreviewStatus.INVALID;
  }

  if (Object.keys(row.mappedValues).length === 0) {
    return StudentImportPreviewStatus.PENDING;
  }

  if (
    row.issues.some(
      (rowIssue) =>
        rowIssue.code === "COURSE_TERM_MISMATCH" ||
        rowIssue.code === "COURSE_NO_MISMATCH",
    )
  ) {
    return StudentImportPreviewStatus.COURSE_MISMATCH;
  }

  if (row.matchedMembershipId) {
    return StudentImportPreviewStatus.ALREADY_ENROLLED;
  }

  if (row.matchedUserId) {
    return StudentImportPreviewStatus.EXISTING_USER;
  }

  return StudentImportPreviewStatus.NEW_USER;
}

function prepareRows(
  sheet: ParsedSpreadsheetSheet,
  headerRow: ParsedSpreadsheetRow,
  mappings: readonly StudentImportFieldMapping[],
  target: ResolvedTarget,
  mappingIssues: readonly StudentImportIssue[],
): PreparedPreviewRow[] {
  const rows = sheet.rows.filter((row) => row.rowNumber > headerRow.rowNumber);
  const requiredMappingErrors = mappingIssues.filter(
    (rowIssue) => rowIssue.level === "error",
  );

  const prepared = rows.map((row): PreparedPreviewRow => {
    const rowIssues: StudentImportIssue[] = [];
    if (isRowBlank(row)) {
      rowIssues.push(
        issue(
          "warning",
          "EMPTY_ROW",
          `第 ${row.rowNumber} 行为空白行，正式导入时会跳过。`,
          { field: "row" },
        ),
      );
    }

    rowIssues.push(...rowFormulaIssues(row, mappings));
    rowIssues.push(...rowMergedCellIssues(row, sheet.mergedRanges));

    const mappedValues = buildMappedValues(row, mappings);
    const sourceRow = sourceRowPayload(
      sheet,
      headerRow,
      row,
      mappings,
      mappedValues,
    );
    const validationIssues =
      isRowBlank(row) || requiredMappingErrors.length > 0
        ? []
        : validateMappedValues(row, mappedValues, mappings, target);

    return {
      rowNumber: row.rowNumber,
      rowKey: baseRowKey(row.rowNumber, mappedValues, sourceRow),
      previewStatus: StudentImportPreviewStatus.PENDING,
      academicTerm: storageText(mappedValues.academicTerm, "academicTerm"),
      courseNo: storageText(mappedValues.courseNo, "courseNo"),
      studentNo: storageText(mappedValues.studentNo, "studentNo"),
      studentName: storageText(mappedValues.studentName, "studentName"),
      className: storageText(mappedValues.className, "className"),
      sourceRow,
      issues: [
        ...rowIssues,
        ...requiredMappingErrors.map((rowIssue) => ({
          ...rowIssue,
          message: `${rowIssue.message} 当前行暂无法完成标准化预览。`,
        })),
        ...validationIssues,
      ],
      mappedValues,
      matchedUserId: null,
      matchedMembershipId: null,
    };
  });

  const duplicateIssues = duplicateIssuesForRows(prepared);
  return prepared.map((row) => {
    const issues = [
      ...row.issues,
      ...(duplicateIssues.get(row.rowNumber) ?? []),
    ];
    const enriched = { ...row, issues };
    return {
      ...enriched,
      previewStatus: previewStatusForRow(enriched),
    };
  });
}

function summarizeRows(
  rows: readonly PreparedPreviewRow[],
): StudentImportSummary {
  const summary: StudentImportSummary = {
    totalRows: rows.length,
    previewRows: rows.length,
    validRows: 0,
    warningRows: 0,
    errorRows: 0,
    warningCount: 0,
    errorCount: 0,
    emptyRows: 0,
    newUserRows: 0,
    existingUserRows: 0,
    alreadyEnrolledRows: 0,
    courseMismatchRows: 0,
    invalidRows: 0,
    duplicateRows: 0,
    canImport: true,
  };

  for (const row of rows) {
    const warningCount = row.issues.filter(
      (rowIssue) => rowIssue.level === "warning",
    ).length;
    const errorCount = row.issues.filter(
      (rowIssue) => rowIssue.level === "error",
    ).length;
    summary.warningCount += warningCount;
    summary.errorCount += errorCount;
    if (warningCount > 0) summary.warningRows += 1;
    if (errorCount > 0) summary.errorRows += 1;
    if (row.issues.some((rowIssue) => rowIssue.code === "EMPTY_ROW")) {
      summary.emptyRows += 1;
    }
    if (
      errorCount === 0 &&
      row.previewStatus !== StudentImportPreviewStatus.PENDING
    ) {
      summary.validRows += 1;
    }

    switch (row.previewStatus) {
      case StudentImportPreviewStatus.NEW_USER:
        summary.newUserRows += 1;
        break;
      case StudentImportPreviewStatus.EXISTING_USER:
        summary.existingUserRows += 1;
        break;
      case StudentImportPreviewStatus.ALREADY_ENROLLED:
        summary.alreadyEnrolledRows += 1;
        break;
      case StudentImportPreviewStatus.COURSE_MISMATCH:
        summary.courseMismatchRows += 1;
        break;
      case StudentImportPreviewStatus.INVALID:
        summary.invalidRows += 1;
        break;
      case StudentImportPreviewStatus.DUPLICATE:
        summary.duplicateRows += 1;
        break;
      case StudentImportPreviewStatus.PENDING:
        break;
    }
  }

  summary.canImport = summary.errorRows === 0 && summary.validRows > 0;
  return summary;
}

function batchIssuesForPreview(
  sheet: ParsedSpreadsheetSheet,
  headerRow: ParsedSpreadsheetRow,
  mappingIssues: readonly StudentImportIssue[],
  dataRows: readonly PreparedPreviewRow[],
): StudentImportIssue[] {
  const issues = [...mappingIssues];
  if (
    sheet.mergedRanges.some(
      (range) =>
        headerRow.rowNumber >= range.startRow &&
        headerRow.rowNumber <= range.endRow,
    )
  ) {
    issues.push(
      issue(
        "error",
        "MERGED_HEADER_ROW",
        "表头行包含合并单元格，请取消合并后重新预览。",
        { field: "header" },
      ),
    );
  }

  if (headerRow.cells.some((cell) => cell.hasFormula)) {
    issues.push(
      issue(
        "error",
        "FORMULA_HEADER_ROW",
        "表头行包含公式，请改为静态文本后重新预览。",
        { field: "header" },
      ),
    );
  }

  if (dataRows.length === 0) {
    issues.push(
      issue("error", "NO_DATA_ROWS", "工作表没有可预览的数据行。", {
        field: "sheet",
      }),
    );
  }

  return issues;
}

function previewMappingSignature(input: {
  sheet: ParsedSpreadsheetSheet;
  headerRow: ParsedSpreadsheetRow;
  target: ResolvedTarget;
  mappings: readonly StudentImportFieldMapping[];
}): Prisma.InputJsonObject {
  return inputJsonObject({
    sheetName: input.sheet.name,
    headerRowNumber: input.headerRow.rowNumber,
    targetClassroomId: input.target.classroom.id,
    fieldMappings: input.mappings.map((mapping) => ({
      field: mapping.field,
      sourceColumnIndex: mapping.sourceColumnIndex,
      sourceHeader: mapping.sourceHeader,
    })),
  });
}

function previewMappingHash(input: {
  sheet: ParsedSpreadsheetSheet;
  headerRow: ParsedSpreadsheetRow;
  target: ResolvedTarget;
  mappings: readonly StudentImportFieldMapping[];
}): string {
  return sha256Text(stableJson(previewMappingSignature(input)));
}

function mappingConfigForPreview(input: {
  file: CourseFileVersionRecord;
  sheet: ParsedSpreadsheetSheet;
  headerRow: ParsedSpreadsheetRow;
  sourceColumns: ReturnType<typeof sourceColumnsFromHeaderRow>;
  mappings: StudentImportFieldMapping[];
  candidates: StudentImportMappingConfig["mappingCandidates"];
  target: ResolvedTarget;
  contentHash: string;
  mappingHash: string;
  now: Date;
  confirmed: boolean;
}): StudentImportMappingConfig {
  return {
    version: STUDENT_IMPORT_MAPPING_VERSION,
    sourceFileVersionId: input.file.id,
    sourceFileChecksum: input.file.checksumSha256,
    sourceFileName: input.file.originalFileName,
    sourceFileKind: input.file.fileKind,
    sourceSheetName: input.sheet.name,
    sourceSheetIndex: input.sheet.index,
    targetCourseId: input.target.course.id,
    targetClassroomId: input.target.classroom.id,
    headerRowNumber: input.headerRow.rowNumber,
    dataStartRowNumber: input.headerRow.rowNumber + 1,
    sourceColumns: input.sourceColumns,
    fieldMappings: input.mappings,
    mappingCandidates: input.candidates,
    mappingHash: input.mappingHash,
    contentHash: input.contentHash,
    generatedAt: input.now.toISOString(),
    confirmedAt: input.confirmed ? input.now.toISOString() : null,
  };
}

function rowCreateData(
  batchId: string,
  row: PreparedPreviewRow,
): Prisma.StudentImportRowCreateManyInput {
  const primaryError = row.issues.find(
    (rowIssue) => rowIssue.level === "error",
  );
  return {
    batchId,
    rowNumber: row.rowNumber,
    previewStatus: row.previewStatus,
    executionStatus: StudentImportExecutionStatus.PENDING,
    rowKey: row.rowKey,
    sourceRow: row.sourceRow,
    academicTerm: row.academicTerm,
    courseNo: row.courseNo,
    studentNo: row.studentNo,
    studentName: row.studentName,
    className: row.className,
    errorCode: primaryError?.code ?? null,
    errorDetail: inputJsonValue({ issues: row.issues }),
    matchedUserId: row.matchedUserId,
    matchedMembershipId: row.matchedMembershipId,
  };
}

function summarySnapshot(input: {
  batchId: string;
  file: CourseFileVersionRecord;
  mappingConfig: StudentImportMappingConfig;
  summary: StudentImportSummary;
  batchIssues: readonly StudentImportIssue[];
}): AuditConfigSnapshot {
  return {
    batchId: input.batchId,
    sourceFileVersionId: input.file.id,
    sourceFileName: input.file.originalFileName,
    sourceFileChecksum: input.file.checksumSha256,
    sheetName: input.mappingConfig.sourceSheetName,
    headerRowNumber: input.mappingConfig.headerRowNumber,
    targetCourseId: input.mappingConfig.targetCourseId,
    targetClassroomId: input.mappingConfig.targetClassroomId,
    mappedFields: input.mappingConfig.fieldMappings.map((mapping) => ({
      field: mapping.field,
      sourceColumnIndex: mapping.sourceColumnIndex,
      sourceHeader: mapping.sourceHeader,
      autoDetected: mapping.autoDetected,
    })),
    summary: inputJsonObject(input.summary) as AuditConfigSnapshot,
    issueCodes: input.batchIssues.map((item) => item.code),
  };
}

function batchViewFromRecord(
  record: StudentImportBatchRecord,
): StudentImportBatchView {
  const previewSummary = jsonObject(record.previewSummary);
  const mappingConfig =
    record.mappingConfig as unknown as StudentImportMappingConfig;
  const summary = (previewSummary.summary ?? {
    totalRows: record.totalRows,
    previewRows: record.previewRows,
    validRows: Math.max(
      0,
      record.previewRows - record.invalidRows - record.duplicateRows,
    ),
    warningRows: record.courseMismatchRows + record.alreadyEnrolledRows,
    errorRows: record.invalidRows + record.duplicateRows,
    warningCount: record.courseMismatchRows + record.alreadyEnrolledRows,
    errorCount: record.invalidRows + record.duplicateRows,
    emptyRows: 0,
    newUserRows: record.newUserRows,
    existingUserRows: record.existingUserRows,
    alreadyEnrolledRows: record.alreadyEnrolledRows,
    courseMismatchRows: record.courseMismatchRows,
    invalidRows: record.invalidRows,
    duplicateRows: record.duplicateRows,
    canImport: record.invalidRows + record.duplicateRows === 0,
  }) as StudentImportSummary;

  const batchIssues = Array.isArray(previewSummary.batchIssues)
    ? (previewSummary.batchIssues as StudentImportIssue[])
    : [];

  return {
    id: record.id,
    status: record.status,
    sourceFileVersionId: record.sourceFileVersionId,
    sourceFileName: record.sourceFileName,
    sourceFileChecksum: record.sourceFileChecksum,
    sourceSheetName: record.sourceSheetName,
    courseId: record.courseId,
    classroomId: record.classroomId,
    mappingConfig,
    summary,
    batchIssues,
    previewedAt: record.previewedAt,
    confirmedAt: record.confirmedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function rowViewFromRecord(
  record: StudentImportRowRecord,
): StudentImportPreviewRowView {
  return {
    rowNumber: record.rowNumber,
    rowKey: record.rowKey,
    previewStatus: record.previewStatus,
    academicTerm: record.academicTerm,
    courseNo: record.courseNo,
    studentNo: record.studentNo,
    studentName: record.studentName,
    className: record.className,
    mappedValues: mappedValuesFromJson(record.sourceRow),
    sourceValues: sourceValuesFromJson(record.sourceRow),
    issues: issueArrayFromJson(record.errorDetail),
  };
}

function executionFailureFromBatch(
  batch: StudentImportExecutionBatchRecord,
): ImportExecutionFailure | null {
  const summary = jsonObject(batch.previewSummary);
  const failure = summary.executionFailure;
  if (!failure || typeof failure !== "object" || Array.isArray(failure)) {
    return null;
  }

  const payload = failure as Record<string, unknown>;
  return {
    code: typeof payload.code === "string" ? payload.code : "UNKNOWN",
    message:
      typeof payload.message === "string"
        ? payload.message
        : "学生名单导入失败",
    retryable: payload.retryable === true,
    rowNumber:
      typeof payload.rowNumber === "number" ? payload.rowNumber : undefined,
    status: payload.retryable === true ? 409 : 409,
  };
}

function isRetryableFailedBatch(
  batch: StudentImportExecutionBatchRecord,
): boolean {
  return (
    batch.status === StudentImportBatchStatus.FAILED &&
    executionFailureFromBatch(batch)?.retryable === true
  );
}

function rowHasBlockingExecutionIssue(row: StudentImportRowRecord): boolean {
  return issueArrayFromJson(row.errorDetail).some(
    (rowIssue) => rowIssue.level === "error",
  );
}

function blockingBatchIssues(
  batch: StudentImportExecutionBatchRecord,
): StudentImportIssue[] {
  const previewSummary = jsonObject(batch.previewSummary);
  const batchIssues = Array.isArray(previewSummary.batchIssues)
    ? (previewSummary.batchIssues as StudentImportIssue[])
    : [];
  return batchIssues.filter((item) => item.level === "error");
}

function executionActionForRow(
  row: StudentImportRowRecord,
): StudentImportExecutionAction {
  if (row.executionStatus === StudentImportExecutionStatus.FAILED) {
    return "FAILED";
  }

  if (row.createdUserId) {
    return "CREATED_USER";
  }

  if (
    row.executionStatus === StudentImportExecutionStatus.SKIPPED &&
    row.matchedMembershipId
  ) {
    return "ALREADY_ENROLLED";
  }

  if (row.matchedUserId) {
    return "MATCHED_EXISTING_USER";
  }

  return "SKIPPED";
}

function executionRowResultFromRecord(
  row: StudentImportRowRecord,
): StudentImportExecutionRowResult {
  return {
    rowNumber: row.rowNumber,
    status: row.executionStatus,
    action: executionActionForRow(row),
    errorCode: row.errorCode,
  };
}

function summarizeExecutionRows(
  rows: readonly StudentImportExecutionRowResult[],
): StudentImportExecutionSummary {
  const summary: StudentImportExecutionSummary = {
    totalRows: rows.length,
    createdUserRows: 0,
    matchedExistingUserRows: 0,
    alreadyEnrolledRows: 0,
    skippedRows: 0,
    failedRows: 0,
    importedRows: 0,
  };

  for (const row of rows) {
    switch (row.action) {
      case "CREATED_USER":
        summary.createdUserRows += 1;
        summary.importedRows += 1;
        break;
      case "MATCHED_EXISTING_USER":
        summary.matchedExistingUserRows += 1;
        summary.importedRows += 1;
        break;
      case "ALREADY_ENROLLED":
        summary.alreadyEnrolledRows += 1;
        break;
      case "FAILED":
        summary.failedRows += 1;
        break;
      case "SKIPPED":
        summary.skippedRows += 1;
        break;
    }
  }

  return summary;
}

function executionResultFromRecords(
  batch: StudentImportExecutionBatchRecord,
  rows: readonly StudentImportRowRecord[],
): StudentImportExecutionResult {
  const rowResults = rows.map(executionRowResultFromRecord);
  return {
    batchId: batch.id,
    status: batch.status,
    idempotencyKey: batch.idempotencyKey,
    retryable: executionFailureFromBatch(batch)?.retryable ?? false,
    summary: summarizeExecutionRows(rowResults),
    rows: rowResults,
    startedAt: batch.startedAt,
    completedAt: batch.completedAt,
  };
}

function executionAuditSnapshot(input: {
  batch: StudentImportExecutionBatchRecord;
  result: StudentImportExecutionResult;
  failure?: ImportExecutionFailure;
}): AuditConfigSnapshot {
  return {
    batchId: input.batch.id,
    courseId: input.batch.courseId,
    classroomId: input.batch.classroomId,
    sourceFileVersionId: input.batch.sourceFileVersionId,
    sourceFileChecksum: input.batch.sourceFileChecksum,
    idempotencyKey: input.batch.idempotencyKey,
    status: input.result.status,
    retryable: input.result.retryable,
    summary: input.result.summary as unknown as AuditConfigSnapshot,
    failureCode: input.failure?.code ?? null,
    failureRowNumber: input.failure?.rowNumber ?? null,
    startedAt: input.result.startedAt?.toISOString() ?? null,
    completedAt: input.result.completedAt?.toISOString() ?? null,
  };
}

async function getPreviewPageByBatchRecord(
  batch: StudentImportBatchRecord,
  page: number,
  pageSize: number,
): Promise<StudentImportPreviewPage> {
  const totalRows = await prisma.studentImportRow.count({
    where: { batchId: batch.id },
  });
  const rows = await prisma.studentImportRow.findMany({
    where: { batchId: batch.id },
    select: rowSelect,
    orderBy: { rowNumber: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    batch: batchViewFromRecord(batch),
    pagination: {
      page,
      pageSize,
      totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
    },
    rows: rows.map(rowViewFromRecord),
  };
}

async function currentLatestFileVersionId(
  file: CourseFileVersionRecord,
): Promise<string | null> {
  if (file.course) {
    const latest = await findLatestCourseFileVersion(
      { type: "COURSE", courseId: file.course.id },
      CourseFileKind.IMPORT_SOURCE,
      STUDENT_ROSTER_FILE_KEY,
    );
    return latest?.id ?? null;
  }

  if (file.classroom) {
    const latest = await findLatestCourseFileVersion(
      { type: "CLASSROOM", classroomId: file.classroom.id },
      CourseFileKind.IMPORT_SOURCE,
      STUDENT_ROSTER_FILE_KEY,
    );
    return latest?.id ?? null;
  }

  return null;
}

async function latestSourceVersionIdForExecutionBatch(
  batch: StudentImportExecutionBatchRecord,
  client: DatabaseClient = prisma,
): Promise<string | null> {
  const sourceFile = batch.sourceFileVersion;
  if (
    sourceFile.fileKind !== CourseFileKind.IMPORT_SOURCE ||
    sourceFile.fileKey !== STUDENT_ROSTER_FILE_KEY
  ) {
    return null;
  }

  if (sourceFile.courseId) {
    const latest = await findLatestCourseFileVersion(
      { type: "COURSE", courseId: sourceFile.courseId },
      CourseFileKind.IMPORT_SOURCE,
      STUDENT_ROSTER_FILE_KEY,
      client,
    );
    return latest?.id ?? null;
  }

  if (sourceFile.classroomId) {
    const latest = await findLatestCourseFileVersion(
      { type: "CLASSROOM", classroomId: sourceFile.classroomId },
      CourseFileKind.IMPORT_SOURCE,
      STUDENT_ROSTER_FILE_KEY,
      client,
    );
    return latest?.id ?? null;
  }

  return null;
}

async function loadExecutionBatchForActor(
  actor: StudentImportActor,
  batchId: string,
  client: DatabaseClient = prisma,
): Promise<StudentImportExecutionBatchRecord> {
  const batch = await client.studentImportBatch.findFirst({
    where: {
      id: batchId,
      ...(actor.role === Role.TEACHER
        ? { course: { teacherId: actor.id } }
        : {}),
    },
    select: executionBatchSelect,
  });

  if (!batch) {
    throw new ResourceNotFoundError("导入批次不存在");
  }

  return batch;
}

async function loadExecutionRows(
  batchId: string,
  client: DatabaseClient = prisma,
): Promise<StudentImportRowRecord[]> {
  return client.studentImportRow.findMany({
    where: { batchId },
    select: rowSelect,
    orderBy: { rowNumber: "asc" },
  });
}

async function assertExecutionBatchReady(
  batch: StudentImportExecutionBatchRecord,
  rows: readonly StudentImportRowRecord[],
  client: DatabaseClient = prisma,
  options: { allowProcessing?: boolean } = {},
): Promise<void> {
  if (batch.status === StudentImportBatchStatus.SUCCEEDED) {
    return;
  }

  if (batch.status === StudentImportBatchStatus.PROCESSING) {
    if (!options.allowProcessing) {
      throw new StudentImportOperationError(
        "学生名单导入正在执行，请稍后查看结果。",
        409,
      );
    }
  }

  const canRetry = isRetryableFailedBatch(batch);
  if (
    batch.status !== StudentImportBatchStatus.CONFIRMED &&
    !(
      options.allowProcessing &&
      batch.status === StudentImportBatchStatus.PROCESSING
    ) &&
    !canRetry
  ) {
    throw new StudentImportOperationError(
      "导入批次尚未完成有效预览确认，不能执行正式导入。",
      409,
    );
  }

  if (!batch.confirmedAt) {
    throw new StudentImportOperationError(
      "导入批次尚未确认字段映射，不能执行正式导入。",
      409,
    );
  }

  if (!batch.classroom || !batch.classroomId) {
    throw new StudentImportOperationError("导入批次没有有效目标班级。", 409);
  }

  if (batch.classroom.status !== ClassroomStatus.ACTIVE) {
    throw new StudentImportOperationError(
      "目标班级已关闭，不能执行正式导入。",
      409,
    );
  }

  if (batch.classroom.courseId !== batch.courseId) {
    throw new StudentImportOperationError(
      "目标班级与导入批次课程不一致，请重新预览。",
      409,
    );
  }

  if (batch.sourceFileChecksum !== batch.sourceFileVersion.checksumSha256) {
    throw new StudentImportOperationError(
      "导入源文件版本与预览记录不一致，请重新预览。",
      409,
    );
  }

  if (
    (await latestSourceVersionIdForExecutionBatch(batch, client)) !==
    batch.sourceFileVersionId
  ) {
    throw new StudentImportOperationError(
      "学生名单预览已不是当前文件版本，请重新预览后再导入。",
      409,
    );
  }

  const previewSummary = jsonObject(batch.previewSummary);
  const summary = previewSummary.summary as StudentImportSummary | undefined;
  if (
    batch.invalidRows > 0 ||
    batch.duplicateRows > 0 ||
    summary?.canImport === false ||
    blockingBatchIssues(batch).length > 0 ||
    rows.some(rowHasBlockingExecutionIssue)
  ) {
    throw new StudentImportOperationError(
      "导入批次存在阻断错误，请修正名单并重新预览。",
      409,
    );
  }

  if (
    rows.every(
      (row) => row.previewStatus === StudentImportPreviewStatus.PENDING,
    )
  ) {
    throw new StudentImportOperationError(
      "导入批次没有可执行的学生记录。",
      409,
    );
  }
}

async function loadCurrentRowUserMatches(
  transaction: Prisma.TransactionClient,
  row: StudentImportRowRecord,
  classroomId: string,
): Promise<{
  byStudentNo: UserMatchRecord | null;
  byEmail: UserMatchRecord | null;
}> {
  const mappedValues = mappedValuesFromJson(row.sourceRow);
  const studentNo = normalizeFieldValue(row.studentNo);
  const email = normalizeEmail(mappedValues.email ?? "");
  const conditions: Prisma.UserWhereInput[] = [];
  if (studentNo) {
    conditions.push({ profile: { is: { studentNo } } });
  }
  if (email) {
    conditions.push({ email: { equals: email, mode: "insensitive" } });
  }
  if (conditions.length === 0) {
    return { byStudentNo: null, byEmail: null };
  }

  const users = await transaction.user.findMany({
    where: { OR: conditions },
    select: {
      ...userMatchSelect,
      classMemberships: {
        where: { classroomId },
        select: { id: true, status: true },
      },
    },
  });

  let byStudentNo: UserMatchRecord | null = null;
  let byEmail: UserMatchRecord | null = null;
  for (const user of users as SelectedUserMatchRecord[]) {
    if (
      user.profile?.studentNo &&
      normalizeFieldValue(user.profile.studentNo) === studentNo
    ) {
      byStudentNo = user;
    }
    if (user.email && normalizeEmail(user.email) === email) {
      byEmail = user;
    }
  }

  return { byStudentNo, byEmail };
}

async function ensureActiveMembership(
  transaction: Prisma.TransactionClient,
  classroomId: string,
  studentId: string,
  now: Date,
): Promise<{ membershipId: string; alreadyActive: boolean }> {
  const existing = await transaction.classMembership.findUnique({
    where: { classroomId_studentId: { classroomId, studentId } },
    select: { id: true, status: true },
  });

  if (existing?.status === MembershipStatus.ACTIVE) {
    return { membershipId: existing.id, alreadyActive: true };
  }

  if (existing) {
    const updated = await transaction.classMembership.update({
      where: { id: existing.id },
      data: {
        status: MembershipStatus.ACTIVE,
        joinedAt: now,
        endedAt: null,
      },
      select: { id: true },
    });
    return { membershipId: updated.id, alreadyActive: false };
  }

  const created = await transaction.classMembership.create({
    data: { classroomId, studentId, joinedAt: now },
    select: { id: true },
  });
  return { membershipId: created.id, alreadyActive: false };
}

function throwRowExecutionFailure(input: {
  code: string;
  message: string;
  rowNumber: number;
  retryable?: boolean;
}): never {
  throw new StudentImportExecutionFailureError({
    code: input.code,
    message: input.message,
    rowNumber: input.rowNumber,
    retryable: input.retryable ?? false,
    status: 409,
  });
}

async function applyExecutableImportRow(
  transaction: Prisma.TransactionClient,
  row: StudentImportRowRecord,
  batch: StudentImportExecutionBatchRecord,
  now: Date,
  dependencies: Required<
    Pick<
      StudentImportExecutionDependencies,
      "passwordGenerator" | "passwordHasher"
    >
  >,
): Promise<void> {
  if (row.previewStatus === StudentImportPreviewStatus.PENDING) {
    await transaction.studentImportRow.update({
      where: { id: row.id },
      data: {
        executionStatus: StudentImportExecutionStatus.SKIPPED,
        errorCode: null,
        processedAt: now,
      },
    });
    return;
  }

  if (
    row.previewStatus === StudentImportPreviewStatus.INVALID ||
    row.previewStatus === StudentImportPreviewStatus.DUPLICATE ||
    rowHasBlockingExecutionIssue(row)
  ) {
    throwRowExecutionFailure({
      code: "BLOCKING_PREVIEW_ROW",
      message: "导入批次存在阻断错误，请重新预览。",
      rowNumber: row.rowNumber,
    });
  }

  if (!batch.classroomId) {
    throwRowExecutionFailure({
      code: "TARGET_CLASSROOM_MISSING",
      message: "导入批次没有有效目标班级。",
      rowNumber: row.rowNumber,
    });
  }

  const mappedValues = mappedValuesFromJson(row.sourceRow);
  const studentNo = normalizeFieldValue(row.studentNo);
  const email = normalizeEmail(mappedValues.email ?? "");
  const matches = await loadCurrentRowUserMatches(
    transaction,
    row,
    batch.classroomId,
  );
  const byStudentNo = matches.byStudentNo;
  const byEmail = matches.byEmail;

  if (byStudentNo) {
    if (byStudentNo.role !== Role.STUDENT) {
      throwRowExecutionFailure({
        code: "STUDENT_NO_ACCOUNT_ROLE_CONFLICT",
        message: "该学号已关联非学生账号，不能通过名单导入变更角色。",
        rowNumber: row.rowNumber,
      });
    }

    if (byEmail && byEmail.id !== byStudentNo.id) {
      throwRowExecutionFailure({
        code: "EMAIL_ACCOUNT_CONFLICT",
        message: "该邮箱已被其他账号使用，请重新预览名单。",
        rowNumber: row.rowNumber,
      });
    }

    const membership = await ensureActiveMembership(
      transaction,
      batch.classroomId,
      byStudentNo.id,
      now,
    );
    await transaction.studentImportRow.update({
      where: { id: row.id },
      data: {
        executionStatus: membership.alreadyActive
          ? StudentImportExecutionStatus.SKIPPED
          : StudentImportExecutionStatus.APPLIED,
        matchedUserId: byStudentNo.id,
        matchedMembershipId: membership.membershipId,
        createdUserId: null,
        createdMembershipId: membership.alreadyActive
          ? null
          : membership.membershipId,
        errorCode: null,
        processedAt: now,
      },
    });
    return;
  }

  if (byEmail) {
    throwRowExecutionFailure({
      code: "EMAIL_ACCOUNT_CONFLICT",
      message: "该邮箱已被系统账号使用，不能用于创建新的学生账号。",
      rowNumber: row.rowNumber,
    });
  }

  const passwordHash = await dependencies.passwordHasher(
    dependencies.passwordGenerator(),
  );
  const user = await transaction.user.create({
    data: {
      email: email || null,
      passwordHash,
      role: Role.STUDENT,
      mustChangePassword: true,
      profile: {
        create: {
          displayName: row.studentName,
          studentNo,
        },
      },
    },
    select: { id: true },
  });
  const membership = await ensureActiveMembership(
    transaction,
    batch.classroomId,
    user.id,
    now,
  );
  await transaction.studentImportRow.update({
    where: { id: row.id },
    data: {
      executionStatus: StudentImportExecutionStatus.APPLIED,
      createdUserId: user.id,
      createdMembershipId: membership.membershipId,
      matchedUserId: null,
      matchedMembershipId: null,
      errorCode: null,
      processedAt: now,
    },
  });
}

async function executeClaimedImportBatch(
  transaction: Prisma.TransactionClient,
  actor: StudentImportActor,
  batchId: string,
  dependencies: Required<
    Pick<
      StudentImportExecutionDependencies,
      "now" | "passwordGenerator" | "passwordHasher"
    >
  >,
  context: AuditRequestContext,
): Promise<StudentImportExecutionResult> {
  const now = dependencies.now();
  const claim = await transaction.studentImportBatch.updateMany({
    where: {
      id: batchId,
      OR: [
        { status: StudentImportBatchStatus.CONFIRMED },
        {
          status: StudentImportBatchStatus.FAILED,
          previewSummary: {
            path: ["executionFailure", "retryable"],
            equals: true,
          },
        },
      ],
      ...(actor.role === Role.TEACHER
        ? { course: { teacherId: actor.id } }
        : {}),
    },
    data: {
      status: StudentImportBatchStatus.PROCESSING,
      startedAt: now,
      completedAt: null,
      importedRows: 0,
      failedRows: 0,
    },
  });

  if (claim.count !== 1) {
    const current = await loadExecutionBatchForActor(
      actor,
      batchId,
      transaction,
    );
    const rows = await loadExecutionRows(batchId, transaction);
    if (current.status === StudentImportBatchStatus.SUCCEEDED) {
      return executionResultFromRecords(current, rows);
    }
    if (current.status === StudentImportBatchStatus.PROCESSING) {
      throw new StudentImportOperationError(
        "学生名单导入正在执行，请稍后查看结果。",
        409,
      );
    }
    throw new StudentImportOperationError(
      "导入批次当前状态不能执行正式导入。",
      409,
    );
  }

  const batch = await loadExecutionBatchForActor(actor, batchId, transaction);
  const rows = await loadExecutionRows(batchId, transaction);
  await assertExecutionBatchReady(batch, rows, transaction, {
    allowProcessing: true,
  });

  for (const row of rows) {
    await applyExecutableImportRow(transaction, row, batch, now, dependencies);
  }

  const appliedRows = await loadExecutionRows(batchId, transaction);
  const appliedResult = executionResultFromRecords(
    {
      ...batch,
      status: StudentImportBatchStatus.SUCCEEDED,
      startedAt: now,
      completedAt: now,
    },
    appliedRows,
  );
  const nextPreviewSummary = jsonObject(batch.previewSummary);
  delete nextPreviewSummary.executionFailure;

  const updatedBatch = await transaction.studentImportBatch.update({
    where: { id: batchId },
    data: {
      status: StudentImportBatchStatus.SUCCEEDED,
      importedRows: appliedResult.summary.importedRows,
      failedRows: 0,
      completedAt: now,
      previewSummary: inputJsonObject({
        ...nextPreviewSummary,
        execution: {
          version: 1,
          status: StudentImportBatchStatus.SUCCEEDED,
          completedAt: now.toISOString(),
          summary: appliedResult.summary,
        },
      }),
    },
    select: executionBatchSelect,
  });
  const finalRows = await loadExecutionRows(batchId, transaction);
  const finalResult = executionResultFromRecords(updatedBatch, finalRows);

  await writeGovernanceAuditLog(transaction, {
    actorId: actor.id,
    action: AuditAction.STUDENT_IMPORT_EXECUTED,
    targetType: AuditTargetType.STUDENT_IMPORT_BATCH,
    targetId: batchId,
    summary: `执行学生名单导入：新建 ${finalResult.summary.createdUserRows} 人，匹配 ${finalResult.summary.matchedExistingUserRows} 人，已在班级 ${finalResult.summary.alreadyEnrolledRows} 人`,
    beforeData: null,
    afterData: executionAuditSnapshot({
      batch: updatedBatch,
      result: finalResult,
    }),
    context,
  });

  return finalResult;
}

function classifyExecutionError(error: unknown): ImportExecutionFailure {
  if (error instanceof StudentImportExecutionFailureError) {
    return error.failure;
  }

  if (isRetryablePrismaError(error)) {
    return {
      code: "RETRYABLE_DATABASE_CONFLICT",
      message: "学生名单导入遇到数据库并发冲突，请重试。",
      retryable: true,
      status: 409,
    };
  }

  if (isUniqueConstraintError(error)) {
    return {
      code: "UNIQUE_IDENTIFIER_CONFLICT",
      message: "学生账号标识已被其他写入占用，请重新预览后再导入。",
      retryable: true,
      status: 409,
    };
  }

  return {
    code: "UNKNOWN_IMPORT_FAILURE",
    message: "学生名单导入失败，正式数据已回滚，请稍后重试。",
    retryable: true,
    status: 500,
  };
}

async function markExecutionFailure(
  actor: StudentImportActor,
  batchId: string,
  failure: ImportExecutionFailure,
  context: AuditRequestContext,
  now: Date,
): Promise<StudentImportExecutionResult | null> {
  return prisma.$transaction(async (transaction) => {
    const batch = await loadExecutionBatchForActor(actor, batchId, transaction);
    if (batch.status === StudentImportBatchStatus.SUCCEEDED) {
      return executionResultFromRecords(
        batch,
        await loadExecutionRows(batchId, transaction),
      );
    }

    if (failure.rowNumber) {
      await transaction.studentImportRow.updateMany({
        where: { batchId, rowNumber: failure.rowNumber },
        data: {
          executionStatus: StudentImportExecutionStatus.FAILED,
          errorCode: failure.code,
          errorDetail: inputJsonValue({
            issues: [
              {
                level: "error",
                code: failure.code,
                message: failure.message,
                field: "row",
              },
            ],
          }),
          processedAt: now,
        },
      });
    }

    const updatedBatch = await transaction.studentImportBatch.update({
      where: { id: batchId },
      data: {
        status: StudentImportBatchStatus.FAILED,
        failedRows: failure.rowNumber ? 1 : Math.max(1, batch.previewRows),
        completedAt: now,
        previewSummary: inputJsonObject({
          ...jsonObject(batch.previewSummary),
          executionFailure: {
            version: 1,
            code: failure.code,
            message: failure.message,
            retryable: failure.retryable,
            rowNumber: failure.rowNumber ?? null,
            failedAt: now.toISOString(),
          },
        }),
      },
      select: executionBatchSelect,
    });
    const rows = await loadExecutionRows(batchId, transaction);
    const result = executionResultFromRecords(updatedBatch, rows);

    await writeGovernanceAuditLog(transaction, {
      actorId: actor.id,
      action: AuditAction.STUDENT_IMPORT_FAILED,
      targetType: AuditTargetType.STUDENT_IMPORT_BATCH,
      targetId: batchId,
      summary: `学生名单导入失败：${failure.code}`,
      beforeData: null,
      afterData: executionAuditSnapshot({
        batch: updatedBatch,
        result,
        failure,
      }),
      context,
    });

    return result;
  });
}

async function executeStudentImportBatchForActor(
  actor: StudentImportActor,
  batchId: string,
  context: AuditRequestContext,
  dependencies: StudentImportExecutionDependencies = {},
): Promise<StudentImportExecutionResult> {
  const batch = await loadExecutionBatchForActor(actor, batchId);
  const rows = await loadExecutionRows(batchId);
  await assertExecutionBatchReady(batch, rows);

  if (batch.status === StudentImportBatchStatus.SUCCEEDED) {
    return executionResultFromRecords(batch, rows);
  }

  const executionDependencies = {
    now: dependencies.now ?? (() => new Date()),
    passwordGenerator:
      dependencies.passwordGenerator ?? generateInitialPassword,
    passwordHasher: dependencies.passwordHasher ?? hashPasswordCore,
  };

  try {
    return await serializableImportTransaction((transaction) =>
      executeClaimedImportBatch(
        transaction,
        actor,
        batchId,
        executionDependencies,
        context,
      ),
    );
  } catch (error: unknown) {
    if (error instanceof StudentImportExecutionFailureError) {
      const failure = error.failure;
      await markExecutionFailure(
        actor,
        batchId,
        failure,
        context,
        executionDependencies.now(),
      );
      throw error;
    }

    if (error instanceof StudentImportOperationError) {
      throw error;
    }

    const failure = classifyExecutionError(error);
    const failed = await markExecutionFailure(
      actor,
      batchId,
      failure,
      context,
      executionDependencies.now(),
    );
    if (failed?.retryable) {
      throw new StudentImportOperationError(
        failure.message,
        failure.status ?? 409,
      );
    }
    throw new StudentImportExecutionFailureError(failure);
  }
}

export async function previewTeacherStudentImportFromFile(
  teacherId: string,
  fileId: string,
  input: StudentImportPreviewRequestData,
  context: AuditRequestContext,
  dependencies: StudentImportPreviewDependencies = {},
): Promise<StudentImportPreviewPage> {
  const file = await findTeacherCourseFileVersionById(teacherId, fileId);
  if (!file) {
    throw new ResourceNotFoundError("学生名单文件不存在");
  }

  const target = await resolvePreviewTarget(teacherId, file, input.classroomId);
  const data = await readSourceFile(file, dependencies);
  const workbook = parseSpreadsheetWorkbook(sourceFormatFromFile(file), data);
  const sheet = selectedSheetFromWorkbook(workbook.sheets, input.sheetName);
  const headerRow = inferHeaderRow(sheet, input.headerRowNumber);
  if (!headerRow) {
    throw new StudentImportOperationError("未找到可识别的表头行。", 400);
  }

  const sourceColumns = sourceColumnsFromHeaderRow(headerRow);
  const mappingResolution = resolveStudentImportMappings(
    sourceColumns,
    input.fieldMappings,
  );
  const rowsBeforeMatches = prepareRows(
    sheet,
    headerRow,
    mappingResolution.fieldMappings,
    target,
    mappingResolution.issues,
  );
  const matchedRows = applyUserMatches(
    rowsBeforeMatches,
    await loadUserMatches(rowsBeforeMatches, target.classroom.id),
  ).map((row) => {
    const enriched = {
      ...row,
      previewStatus: previewStatusForRow(row),
    };
    return enriched;
  });

  const summary = summarizeRows(matchedRows);
  const batchIssues = batchIssuesForPreview(
    sheet,
    headerRow,
    mappingResolution.issues,
    matchedRows,
  );
  if (batchIssues.some((rowIssue) => rowIssue.level === "error")) {
    summary.canImport = false;
  }
  const now = dependencies.now?.() ?? new Date();
  const mappingHash = previewMappingHash({
    sheet,
    headerRow,
    target,
    mappings: mappingResolution.fieldMappings,
  });
  const latestFileVersionId = await currentLatestFileVersionId(file);
  const confirmed = input.confirmMapping && summary.canImport;
  const contentHash = sha256Text(
    stableJson({
      fileId: file.id,
      checksum: file.checksumSha256,
      latestFileVersionId,
      sheetName: sheet.name,
      headerRowNumber: headerRow.rowNumber,
    }),
  );
  const mappingConfig = mappingConfigForPreview({
    file,
    sheet,
    headerRow,
    sourceColumns,
    mappings: mappingResolution.fieldMappings,
    candidates: mappingResolution.mappingCandidates,
    target,
    contentHash,
    mappingHash,
    now,
    confirmed,
  });
  const idempotencyKey = `student-roster-preview:${file.id}:${mappingHash}`;
  const previewSummary = inputJsonObject({
    version: 1,
    summary,
    batchIssues,
    latestFileVersionId,
    generatedAt: now.toISOString(),
  });

  const batch = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.studentImportBatch.findUnique({
      where: {
        courseId_idempotencyKey: {
          courseId: target.course.id,
          idempotencyKey,
        },
      },
      select: { id: true, status: true },
    });

    const previewData = {
      classroomId: target.classroom.id,
      createdById: teacherId,
      sourceFileVersionId: file.id,
      status: confirmed
        ? StudentImportBatchStatus.CONFIRMED
        : StudentImportBatchStatus.PREVIEW_READY,
      sourceFileName: file.originalFileName,
      sourceFileChecksum: file.checksumSha256,
      sourceFileMimeType: file.mimeType,
      sourceFileSizeBytes: file.sizeBytes,
      sourceSheetName: sheet.name,
      mappingConfig: inputJsonObject(mappingConfig),
      previewSummary,
      totalRows: summary.totalRows,
      previewRows: summary.previewRows,
      newUserRows: summary.newUserRows,
      existingUserRows: summary.existingUserRows,
      alreadyEnrolledRows: summary.alreadyEnrolledRows,
      courseMismatchRows: summary.courseMismatchRows,
      invalidRows: summary.invalidRows,
      duplicateRows: summary.duplicateRows,
      importedRows: 0,
      failedRows: 0,
      previewedAt: now,
      confirmedAt: confirmed ? now : null,
      startedAt: null,
      completedAt: null,
    };

    let saved: StudentImportBatchRecord;
    let rowsNeedRefresh = true;
    if (!existing) {
      saved = await transaction.studentImportBatch.create({
        data: {
          courseId: target.course.id,
          idempotencyKey,
          ...previewData,
        },
        select: batchSelect,
      });
    } else if (
      existing.status === StudentImportBatchStatus.PROCESSING ||
      existing.status === StudentImportBatchStatus.SUCCEEDED ||
      existing.status === StudentImportBatchStatus.PARTIAL_FAILED
    ) {
      const current = await transaction.studentImportBatch.findUniqueOrThrow({
        where: { id: existing.id },
        select: batchSelect,
      });
      saved = current;
      rowsNeedRefresh = false;
    } else {
      const updated = await transaction.studentImportBatch.updateMany({
        where: {
          id: existing.id,
          status: {
            notIn: [
              StudentImportBatchStatus.PROCESSING,
              StudentImportBatchStatus.SUCCEEDED,
              StudentImportBatchStatus.PARTIAL_FAILED,
            ],
          },
        },
        data: previewData,
      });
      saved = await transaction.studentImportBatch.findUniqueOrThrow({
        where: { id: existing.id },
        select: batchSelect,
      });
      rowsNeedRefresh = updated.count === 1;
    }

    if (rowsNeedRefresh) {
      await transaction.studentImportRow.deleteMany({
        where: { batchId: saved.id },
      });

      if (matchedRows.length > 0) {
        await transaction.studentImportRow.createMany({
          data: matchedRows.map((row) => rowCreateData(saved.id, row)),
        });
      }
    }

    if (rowsNeedRefresh) {
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: confirmed
          ? AuditAction.STUDENT_IMPORT_MAPPING_CONFIRMED
          : AuditAction.STUDENT_IMPORT_PREVIEWED,
        targetType: AuditTargetType.STUDENT_IMPORT_BATCH,
        targetId: saved.id,
        summary: confirmed
          ? "确认学生名单导入字段映射"
          : "生成学生名单导入预览",
        beforeData: null,
        afterData: summarySnapshot({
          batchId: saved.id,
          file,
          mappingConfig,
          summary,
          batchIssues,
        }),
        context,
      });
    }

    return saved;
  });

  return getPreviewPageByBatchRecord(batch, input.page, input.pageSize);
}

export async function getTeacherStudentImportPreview(
  teacherId: string,
  batchId: string,
  page: number,
  pageSize: number,
): Promise<StudentImportPreviewPage> {
  const batch = await prisma.studentImportBatch.findFirst({
    where: { id: batchId, course: { teacherId } },
    select: batchSelect,
  });

  if (!batch) {
    throw new ResourceNotFoundError("导入批次不存在");
  }

  return getPreviewPageByBatchRecord(batch, page, pageSize);
}

export function executeTeacherStudentImportBatch(
  teacherId: string,
  batchId: string,
  context: AuditRequestContext,
  dependencies: StudentImportExecutionDependencies = {},
): Promise<StudentImportExecutionResult> {
  return executeStudentImportBatchForActor(
    { id: teacherId, role: Role.TEACHER },
    batchId,
    context,
    dependencies,
  );
}

export function executeAdminStudentImportBatch(
  adminId: string,
  batchId: string,
  context: AuditRequestContext,
  dependencies: StudentImportExecutionDependencies = {},
): Promise<StudentImportExecutionResult> {
  return executeStudentImportBatchForActor(
    { id: adminId, role: Role.ADMIN },
    batchId,
    context,
    dependencies,
  );
}
