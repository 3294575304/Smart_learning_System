import assert from "node:assert/strict";
import test from "node:test";

import { GRADE_TEMPLATE_HEADERS } from "@/services/gradebook/constants";
import { buildGradeTemplateXlsx } from "@/services/gradebook/xlsx-writer";
import { parseSpreadsheetWorkbook } from "@/services/student-imports/spreadsheet-parser";

test("导出工作簿保持固定工作表、十列表头和文本学号", () => {
  const data = buildGradeTemplateXlsx([
    [...GRADE_TEMPLATE_HEADERS],
    [
      "2025-2026-1",
      "PY101",
      "001234567890123456",
      "测试学生",
      "Python 02",
      "",
      "0",
      "",
      "百分制",
      "",
    ],
  ]);
  const workbook = parseSpreadsheetWorkbook("xlsx", data);
  assert.equal(workbook.sheets.length, 1);
  const sheet = workbook.sheets[0]!;
  assert.equal(sheet.name, "sheet");
  assert.equal(sheet.hidden, false);
  assert.deepEqual(
    sheet.rows[0]!.cells.map((cell) => cell.value),
    [...GRADE_TEMPLATE_HEADERS],
  );
  const studentNo = sheet.rows[1]!.cells.find((cell) => cell.columnIndex === 2);
  assert.equal(studentNo?.type, "string");
  assert.equal(studentNo?.value, "001234567890123456");
  assert.equal(sheet.mergedRanges.length, 0);
  assert.equal(
    sheet.rows.some((row) => row.cells.some((cell) => cell.hasFormula)),
    false,
  );
});
