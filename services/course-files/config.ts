export const STUDENT_ROSTER_FILE_KEY = "student-roster";
export const STUDENT_ROSTER_TITLE = "学生名单";

const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_STUDENT_ROSTER_ROWS = 1000;
const MIN_MAX_FILE_SIZE_BYTES = 1024;
const MAX_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MIN_MAX_STUDENT_ROSTER_ROWS = 1;
const MAX_MAX_STUDENT_ROSTER_ROWS = 20_000;

function boundedIntegerFromEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return fallback;

  return Math.min(Math.max(parsed, min), max);
}

export const courseFileUploadConfig = Object.freeze({
  maxFileSizeBytes: boundedIntegerFromEnv(
    "COURSE_FILE_MAX_SIZE_BYTES",
    DEFAULT_MAX_FILE_SIZE_BYTES,
    MIN_MAX_FILE_SIZE_BYTES,
    MAX_MAX_FILE_SIZE_BYTES,
  ),
  maxStudentRosterRows: boundedIntegerFromEnv(
    "STUDENT_ROSTER_MAX_ROWS",
    DEFAULT_MAX_STUDENT_ROSTER_ROWS,
    MIN_MAX_STUDENT_ROSTER_ROWS,
    MAX_MAX_STUDENT_ROSTER_ROWS,
  ),
});

export const studentRosterMimeTypes = Object.freeze({
  csv: new Set(["text/csv", "application/csv", "text/plain"]),
  xls: new Set(["application/vnd.ms-excel"]),
  xlsx: new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]),
});

export type StudentRosterExtension = keyof typeof studentRosterMimeTypes;
