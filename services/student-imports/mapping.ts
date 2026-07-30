import {
  ParsedSpreadsheetRow,
  ParsedSpreadsheetSheet,
  columnNameFromIndex,
} from "@/services/student-imports/spreadsheet-parser";
import {
  requiredStudentImportFields,
  stableStudentImportFields,
  studentImportFieldLabels,
  type StudentImportField,
  type StudentImportFieldMapping,
  type StudentImportIssue,
  type StudentImportMappingCandidate,
  type StudentImportSourceColumn,
} from "@/services/student-imports/types";

const fieldSynonyms: Record<StudentImportField, readonly string[]> = {
  academicTerm: ["学年学期", "学期", "学年", "term", "semester"],
  courseNo: [
    "课程号",
    "课程编号",
    "课程代码",
    "课号",
    "course no",
    "course code",
  ],
  studentNo: ["学号", "学生学号", "学籍号", "student no", "student number"],
  studentName: ["姓名", "学生姓名", "名字", "name", "student name"],
  className: ["班级", "行政班", "教学班", "班级名称", "class"],
  email: ["邮箱", "电子邮箱", "邮件", "email", "e-mail"],
  phone: ["联系方式", "联系电话", "手机号", "手机", "电话", "phone", "mobile"],
  gradeMark: ["成绩标识", "成绩状态", "标识"],
  finalGrade: ["期末成绩", "期末成绩100.0%", "成绩", "final grade"],
  specialReason: ["特殊原因", "原因"],
  gradeType: ["等级成绩类型", "等级类型", "成绩类型"],
  remark: ["备注", "说明", "remark", "comment"],
};

function normalizeHeaderText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/gu, "")
    .replace(/[（(\[{【《<]\s*文本\s*[）)\]}】》>]/gu, "")
    .replace(/[（）()\[\]{}【】《》<>:：,，.。;；_\-\s]/gu, "");
}

function normalizeSynonyms(values: readonly string[]): string[] {
  return values.map(normalizeHeaderText);
}

const normalizedFieldSynonyms = Object.fromEntries(
  (Object.keys(fieldSynonyms) as StudentImportField[]).map((field) => [
    field,
    normalizeSynonyms(fieldSynonyms[field]),
  ]),
) as unknown as Record<StudentImportField, readonly string[]>;

export function normalizeStudentImportHeader(value: string): string {
  return normalizeHeaderText(value);
}

function isRequiredField(field: StudentImportField): boolean {
  return requiredStudentImportFields.includes(
    field as (typeof requiredStudentImportFields)[number],
  );
}

function isStableField(field: StudentImportField): boolean {
  return stableStudentImportFields.includes(
    field as (typeof stableStudentImportFields)[number],
  );
}

function nonEmptyCellCount(row: ParsedSpreadsheetRow): number {
  return row.cells.filter((cell) => cell.value.trim() !== "").length;
}

function rowHeaderScore(row: ParsedSpreadsheetRow): number {
  let score = 0;
  for (const cell of row.cells) {
    const normalized = normalizeHeaderText(cell.value);
    if (!normalized) continue;
    score += 1;
    for (const synonyms of Object.values(normalizedFieldSynonyms)) {
      if (synonyms.includes(normalized)) {
        score += 10;
        break;
      }
      if (
        synonyms.some(
          (synonym) =>
            normalized.includes(synonym) || synonym.includes(normalized),
        )
      ) {
        score += 5;
        break;
      }
    }
  }
  return score;
}

export function inferHeaderRow(
  sheet: ParsedSpreadsheetSheet,
  requestedHeaderRowNumber?: number,
): ParsedSpreadsheetRow | null {
  if (requestedHeaderRowNumber) {
    return (
      sheet.rows.find((row) => row.rowNumber === requestedHeaderRowNumber) ??
      null
    );
  }

  const candidates = sheet.rows
    .filter((row) => row.rowNumber <= 10 && nonEmptyCellCount(row) > 0)
    .map((row) => ({
      row,
      score: rowHeaderScore(row),
      nonEmptyCells: nonEmptyCellCount(row),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.nonEmptyCells - left.nonEmptyCells ||
        left.row.rowNumber - right.row.rowNumber,
    );

  return candidates[0]?.row ?? null;
}

function maxUsedColumnIndex(row: ParsedSpreadsheetRow): number {
  return row.cells.reduce(
    (max, cell) => Math.max(max, cell.columnIndex),
    row.cells.length > 0 ? 0 : -1,
  );
}

export function sourceColumnsFromHeaderRow(
  headerRow: ParsedSpreadsheetRow,
): StudentImportSourceColumn[] {
  const cellByColumn = new Map(
    headerRow.cells.map((cell) => [cell.columnIndex, cell]),
  );
  const maxColumnIndex = maxUsedColumnIndex(headerRow);

  return Array.from({ length: maxColumnIndex + 1 }, (_, columnIndex) => {
    const cell = cellByColumn.get(columnIndex);
    const header = cell?.value.trim() ?? "";
    return {
      columnIndex,
      columnName: columnNameFromIndex(columnIndex),
      header,
      normalizedHeader: normalizeHeaderText(header),
      isBlank: header === "",
      hasFormula: cell?.hasFormula ?? false,
    };
  });
}

function scoreColumnForField(
  field: StudentImportField,
  column: StudentImportSourceColumn,
): number {
  if (column.isBlank) return 0;
  const synonyms = normalizedFieldSynonyms[field];
  if (synonyms.includes(column.normalizedHeader)) return 1;
  if (synonyms.some((synonym) => column.normalizedHeader === synonym)) return 1;
  if (synonyms.some((synonym) => column.normalizedHeader.includes(synonym))) {
    return 0.9;
  }
  if (synonyms.some((synonym) => synonym.includes(column.normalizedHeader))) {
    return 0.72;
  }
  return 0;
}

function candidateForColumn(
  field: StudentImportField,
  column: StudentImportSourceColumn,
  confidence: number,
): StudentImportMappingCandidate {
  return {
    field,
    sourceColumnIndex: column.columnIndex,
    sourceColumnName: column.columnName,
    sourceHeader: column.header,
    confidence,
  };
}

function mappingFromCandidate(
  candidate: StudentImportMappingCandidate,
  autoDetected: boolean,
): StudentImportFieldMapping {
  return {
    ...candidate,
    autoDetected,
    required: isRequiredField(candidate.field),
    stableIdentifier: isStableField(candidate.field),
  };
}

export function headerIssues(
  sourceColumns: readonly StudentImportSourceColumn[],
): StudentImportIssue[] {
  const issues: StudentImportIssue[] = [];
  const normalizedHeaderCounts = new Map<string, StudentImportSourceColumn[]>();

  for (const column of sourceColumns) {
    if (column.isBlank) {
      issues.push({
        level: "warning",
        code: "BLANK_HEADER_CELL",
        message: `${column.columnName} 列表头为空，未映射时会被忽略。`,
        field: "header",
        sourceColumnIndex: column.columnIndex,
        sourceColumnName: column.columnName,
      });
      continue;
    }

    if (column.hasFormula) {
      issues.push({
        level: "error",
        code: "FORMULA_HEADER_CELL",
        message: `${column.columnName} 列表头包含公式，请改为静态文本。`,
        field: "header",
        sourceHeader: column.header,
        sourceColumnIndex: column.columnIndex,
        sourceColumnName: column.columnName,
      });
    }

    const existing = normalizedHeaderCounts.get(column.normalizedHeader) ?? [];
    existing.push(column);
    normalizedHeaderCounts.set(column.normalizedHeader, existing);
  }

  for (const columns of normalizedHeaderCounts.values()) {
    if (columns.length <= 1) continue;
    for (const column of columns) {
      issues.push({
        level: "warning",
        code: "DUPLICATE_HEADER_CELL",
        message: `${column.columnName} 列表头与其他列重复，请确认字段映射。`,
        field: "header",
        sourceHeader: column.header,
        sourceColumnIndex: column.columnIndex,
        sourceColumnName: column.columnName,
      });
    }
  }

  return issues;
}

export function resolveStudentImportMappings(
  sourceColumns: readonly StudentImportSourceColumn[],
  manualMappings?: Partial<Record<StudentImportField, number>>,
): {
  fieldMappings: StudentImportFieldMapping[];
  mappingCandidates: StudentImportMappingCandidate[];
  issues: StudentImportIssue[];
} {
  const issues = headerIssues(sourceColumns);
  const candidateScores: StudentImportMappingCandidate[] = [];

  for (const field of Object.keys(fieldSynonyms) as StudentImportField[]) {
    for (const column of sourceColumns) {
      const confidence = scoreColumnForField(field, column);
      if (confidence > 0) {
        candidateScores.push(candidateForColumn(field, column, confidence));
      }
    }
  }

  const mappings: StudentImportFieldMapping[] = [];
  const usedColumns = new Set<number>();

  if (manualMappings) {
    for (const field of Object.keys(manualMappings) as StudentImportField[]) {
      const columnIndex = manualMappings[field];
      if (columnIndex === undefined) continue;
      const column = sourceColumns.find(
        (item) => item.columnIndex === columnIndex,
      );
      if (!column) {
        issues.push({
          level: "error",
          code: "MAPPING_COLUMN_NOT_FOUND",
          message: `${studentImportFieldLabels[field]} 映射的源列不存在。`,
          field,
          sourceColumnIndex: columnIndex,
          sourceColumnName: columnNameFromIndex(columnIndex),
        });
        continue;
      }

      if (usedColumns.has(columnIndex)) {
        issues.push({
          level: "error",
          code: "MAPPING_COLUMN_REUSED",
          message: `${column.columnName} 列不能同时映射到多个字段。`,
          field,
          sourceHeader: column.header,
          sourceColumnIndex: column.columnIndex,
          sourceColumnName: column.columnName,
        });
        continue;
      }

      usedColumns.add(columnIndex);
      mappings.push(
        mappingFromCandidate(candidateForColumn(field, column, 1), false),
      );
    }
  } else {
    for (const field of Object.keys(fieldSynonyms) as StudentImportField[]) {
      const candidate = candidateScores
        .filter((item) => item.field === field)
        .sort((left, right) => right.confidence - left.confidence)[0];
      if (!candidate || candidate.confidence < 0.72) continue;
      if (usedColumns.has(candidate.sourceColumnIndex)) continue;
      usedColumns.add(candidate.sourceColumnIndex);
      mappings.push(mappingFromCandidate(candidate, true));
    }
  }

  const mappedFields = new Set(mappings.map((mapping) => mapping.field));
  for (const field of requiredStudentImportFields) {
    if (!mappedFields.has(field)) {
      issues.push({
        level: "error",
        code: "REQUIRED_FIELD_UNMAPPED",
        message: `${studentImportFieldLabels[field]} 是必填字段，请完成字段映射。`,
        field,
      });
    }
  }

  return {
    fieldMappings: mappings.sort(
      (left, right) => left.sourceColumnIndex - right.sourceColumnIndex,
    ),
    mappingCandidates: candidateScores.sort(
      (left, right) =>
        left.field.localeCompare(right.field) ||
        right.confidence - left.confidence,
    ),
    issues,
  };
}
