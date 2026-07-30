import type {
  CourseFileKind,
  Prisma,
  StudentImportBatchStatus,
  StudentImportPreviewStatus,
} from "@prisma/client";

export const STUDENT_IMPORT_MAPPING_VERSION = 1;

export const studentImportFields = [
  "academicTerm",
  "courseNo",
  "studentNo",
  "studentName",
  "className",
  "email",
  "phone",
  "gradeMark",
  "finalGrade",
  "specialReason",
  "gradeType",
  "remark",
] as const;

export type StudentImportField = (typeof studentImportFields)[number];

export const requiredStudentImportFields = [
  "academicTerm",
  "courseNo",
  "studentNo",
  "studentName",
  "className",
] as const satisfies readonly StudentImportField[];

export const stableStudentImportFields = [
  "studentNo",
  "email",
] as const satisfies readonly StudentImportField[];

export const studentImportFieldLabels: Record<StudentImportField, string> = {
  academicTerm: "学年学期",
  courseNo: "课程号",
  studentNo: "学号",
  studentName: "姓名",
  className: "班级",
  email: "邮箱",
  phone: "联系方式",
  gradeMark: "成绩标识",
  finalGrade: "期末成绩",
  specialReason: "特殊原因",
  gradeType: "等级成绩类型",
  remark: "备注",
};

export type StudentImportIssueLevel = "error" | "warning";

export interface StudentImportIssue {
  level: StudentImportIssueLevel;
  code: string;
  message: string;
  field?: StudentImportField | "sheet" | "header" | "row";
  sourceHeader?: string;
  sourceColumnIndex?: number;
  sourceColumnName?: string;
  relatedRows?: number[];
}

export interface StudentImportSourceColumn {
  columnIndex: number;
  columnName: string;
  header: string;
  normalizedHeader: string;
  isBlank: boolean;
  hasFormula: boolean;
}

export interface StudentImportFieldMapping {
  field: StudentImportField;
  sourceColumnIndex: number;
  sourceColumnName: string;
  sourceHeader: string;
  confidence: number;
  autoDetected: boolean;
  required: boolean;
  stableIdentifier: boolean;
}

export interface StudentImportMappingCandidate {
  field: StudentImportField;
  sourceColumnIndex: number;
  sourceColumnName: string;
  sourceHeader: string;
  confidence: number;
}

export interface StudentImportMappingConfig {
  version: typeof STUDENT_IMPORT_MAPPING_VERSION;
  sourceFileVersionId: string;
  sourceFileChecksum: string;
  sourceFileName: string;
  sourceFileKind: CourseFileKind;
  sourceSheetName: string;
  sourceSheetIndex: number;
  targetCourseId: string;
  targetClassroomId: string;
  headerRowNumber: number;
  dataStartRowNumber: number;
  sourceColumns: StudentImportSourceColumn[];
  fieldMappings: StudentImportFieldMapping[];
  mappingCandidates: StudentImportMappingCandidate[];
  mappingHash: string;
  contentHash: string;
  generatedAt: string;
  confirmedAt: string | null;
}

export interface StudentImportSummary {
  totalRows: number;
  previewRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  warningCount: number;
  errorCount: number;
  emptyRows: number;
  newUserRows: number;
  existingUserRows: number;
  alreadyEnrolledRows: number;
  courseMismatchRows: number;
  invalidRows: number;
  duplicateRows: number;
  canImport: boolean;
}

export interface StudentImportBatchView {
  id: string;
  status: StudentImportBatchStatus;
  sourceFileVersionId: string;
  sourceFileName: string;
  sourceFileChecksum: string;
  sourceSheetName: string | null;
  courseId: string;
  classroomId: string | null;
  mappingConfig: StudentImportMappingConfig;
  summary: StudentImportSummary;
  batchIssues: StudentImportIssue[];
  previewedAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentImportPreviewRowView {
  rowNumber: number;
  rowKey: string;
  previewStatus: StudentImportPreviewStatus;
  academicTerm: string;
  courseNo: string;
  studentNo: string;
  studentName: string;
  className: string;
  mappedValues: Partial<Record<StudentImportField, string>>;
  sourceValues: Array<{
    columnIndex: number;
    columnName: string;
    header: string;
    value: string;
    hasFormula: boolean;
  }>;
  issues: StudentImportIssue[];
}

export interface StudentImportPreviewPage {
  batch: StudentImportBatchView;
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
  rows: StudentImportPreviewRowView[];
}

export type StudentImportRawRow = Prisma.InputJsonObject;
