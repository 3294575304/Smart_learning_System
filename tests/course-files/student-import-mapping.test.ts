import assert from "node:assert/strict";
import test from "node:test";

import {
  inferHeaderRow,
  resolveStudentImportMappings,
  sourceColumnsFromHeaderRow,
} from "@/services/student-imports/mapping";
import type { ParsedSpreadsheetRow } from "@/services/student-imports/spreadsheet-parser";
import { columnNameFromIndex } from "@/services/student-imports/spreadsheet-parser";
import type { StudentImportField } from "@/services/student-imports/types";
import { buildCsvFixture } from "../helpers/student-import-fixtures";
import { parseSpreadsheetWorkbook } from "@/services/student-imports/spreadsheet-parser";

function headerRow(values: readonly string[]): ParsedSpreadsheetRow {
  return {
    rowNumber: 1,
    cells: values.map((value, columnIndex) => ({
      rowNumber: 1,
      columnIndex,
      columnName: columnNameFromIndex(columnIndex),
      value,
      rawValue: value,
      type: value ? "string" : "blank",
      hasFormula: false,
    })),
  };
}

test("固定 10 列模板可以自动识别字段映射", () => {
  const workbook = parseSpreadsheetWorkbook(
    "csv",
    buildCsvFixture({
      rows: [
        [
          "2026-2027-1",
          "PYTHON-01",
          "000000000000000001",
          "学生甲",
          "软件1班",
          "",
          "",
          "",
          "",
          "",
        ],
      ],
    }),
  );
  const sheet = workbook.sheets[0];
  assert.ok(sheet);
  const header = inferHeaderRow(sheet);
  assert.ok(header);

  const resolved = resolveStudentImportMappings(
    sourceColumnsFromHeaderRow(header),
  );

  const byField = new Map(
    resolved.fieldMappings.map((mapping) => [mapping.field, mapping]),
  );
  assert.equal(byField.get("academicTerm")?.sourceColumnIndex, 0);
  assert.equal(byField.get("courseNo")?.sourceColumnIndex, 1);
  assert.equal(byField.get("studentNo")?.sourceColumnIndex, 2);
  assert.equal(byField.get("studentName")?.sourceColumnIndex, 3);
  assert.equal(byField.get("className")?.sourceColumnIndex, 4);
  assert.equal(byField.get("gradeMark")?.sourceColumnIndex, 5);
  assert.equal(byField.get("finalGrade")?.sourceColumnIndex, 6);
  assert.equal(byField.get("specialReason")?.sourceColumnIndex, 7);
  assert.equal(byField.get("gradeType")?.sourceColumnIndex, 8);
  assert.equal(byField.get("remark")?.sourceColumnIndex, 9);
  assert.equal(
    resolved.issues.some((issue) => issue.level === "error"),
    false,
  );
});

test("教师可以为非标准表头手动选择字段映射", () => {
  const sourceColumns = sourceColumnsFromHeaderRow(
    headerRow(["学期值", "课程", "编号", "学生", "教学班"]),
  );
  const manualMappings: Partial<Record<StudentImportField, number>> = {
    academicTerm: 0,
    courseNo: 1,
    studentNo: 2,
    studentName: 3,
    className: 4,
  };

  const resolved = resolveStudentImportMappings(sourceColumns, manualMappings);

  assert.equal(resolved.fieldMappings.length, 5);
  assert.equal(
    resolved.fieldMappings.every((mapping) => mapping.autoDetected === false),
    true,
  );
  assert.equal(
    resolved.issues.some((issue) => issue.level === "error"),
    false,
  );
});

test("缺少必填字段映射会返回阻断错误", () => {
  const resolved = resolveStudentImportMappings(
    sourceColumnsFromHeaderRow(headerRow(["学年学期(文本)", "课程号(文本)"])),
  );

  assert.deepEqual(
    resolved.issues
      .filter((issue) => issue.code === "REQUIRED_FIELD_UNMAPPED")
      .map((issue) => issue.field)
      .sort(),
    ["className", "studentName", "studentNo"],
  );
});

test("空白、重复和公式表头会进入映射问题清单", () => {
  const row = headerRow(["学号", "学号", ""]);
  row.cells[0] = { ...row.cells[0]!, hasFormula: true };

  const resolved = resolveStudentImportMappings(
    sourceColumnsFromHeaderRow(row),
  );
  const codes = resolved.issues.map((issue) => issue.code);

  assert.equal(codes.includes("FORMULA_HEADER_CELL"), true);
  assert.equal(codes.includes("DUPLICATE_HEADER_CELL"), true);
  assert.equal(codes.includes("BLANK_HEADER_CELL"), true);
});
