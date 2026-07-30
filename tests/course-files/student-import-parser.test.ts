import assert from "node:assert/strict";
import test from "node:test";

import { StudentImportOperationError } from "@/services/student-imports/errors";
import { parseSpreadsheetWorkbook } from "@/services/student-imports/spreadsheet-parser";
import {
  buildCsvFixture,
  buildXlsFixture,
  buildXlsxFixture,
  officialStudentRosterHeaders,
} from "../helpers/student-import-fixtures";

const rosterRows = [
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
  [
    "2026-2027-1",
    "PYTHON-01",
    "000000000000000002",
    "学生乙",
    "软件1班",
    "",
    "",
    "",
    "",
    "",
  ],
];

test("学生名单解析器读取 CSV、XLSX 和旧版 XLS，并保留学号文本", () => {
  const csv = parseSpreadsheetWorkbook(
    "csv",
    buildCsvFixture({ rows: rosterRows }),
  );
  const xlsx = parseSpreadsheetWorkbook(
    "xlsx",
    buildXlsxFixture([
      {
        name: "Roster",
        headers: officialStudentRosterHeaders,
        rows: rosterRows,
      },
    ]),
  );
  const xls = parseSpreadsheetWorkbook(
    "xls",
    buildXlsFixture({
      name: "Roster",
      headers: officialStudentRosterHeaders,
      rows: rosterRows,
    }),
  );

  for (const workbook of [csv, xlsx, xls]) {
    assert.equal(workbook.sheets.length, 1);
    const sheet = workbook.sheets[0];
    assert.ok(sheet);
    assert.equal(sheet.rows.length, 3);
    assert.equal(sheet.rows[0]?.cells[0]?.value, "学年学期(文本)");
    assert.equal(sheet.rows[0]?.cells[9]?.value, "备注(文本)");
    assert.equal(sheet.rows[1]?.cells[2]?.value, "000000000000000001");
    assert.equal(sheet.rows[1]?.cells[2]?.type, "string");
  }
});

test("XLSX 解析器标记隐藏工作表、合并单元格和公式单元格", () => {
  const workbook = parseSpreadsheetWorkbook(
    "xlsx",
    buildXlsxFixture([
      {
        name: "HiddenRoster",
        headers: officialStudentRosterHeaders,
        rows: rosterRows,
        hidden: true,
        mergedRanges: ["A1:B1"],
        formulaCells: [
          {
            rowNumber: 2,
            columnIndex: 2,
            formula: "1+1",
            value: "2",
          },
        ],
      },
    ]),
  );

  const sheet = workbook.sheets[0];
  assert.ok(sheet);
  assert.equal(sheet.hidden, true);
  assert.deepEqual(sheet.mergedRanges[0], {
    ref: "A1:B1",
    startRow: 1,
    endRow: 1,
    startColumnIndex: 0,
    endColumnIndex: 1,
  });
  assert.equal(sheet.rows[1]?.cells[2]?.hasFormula, true);
});

test("XLS 解析器标记合并单元格和公式单元格", () => {
  const workbook = parseSpreadsheetWorkbook(
    "xls",
    buildXlsFixture({
      name: "Roster",
      headers: officialStudentRosterHeaders,
      rows: rosterRows,
      mergedRanges: ["A2:B2"],
      formulaCells: [
        {
          rowNumber: 2,
          columnIndex: 2,
          formula: "1+1",
          value: "2",
        },
      ],
    }),
  );

  const sheet = workbook.sheets[0];
  assert.ok(sheet);
  assert.equal(sheet.mergedRanges[0]?.ref, "A2:B2");
  assert.equal(sheet.rows[1]?.cells[2]?.hasFormula, true);
});

test("解析器拒绝不可解析的工作簿内容", () => {
  assert.throws(
    () => parseSpreadsheetWorkbook("xlsx", Buffer.from("not a zip", "utf8")),
    StudentImportOperationError,
  );
  assert.throws(
    () =>
      parseSpreadsheetWorkbook("xls", Buffer.from("not an ole file", "utf8")),
    StudentImportOperationError,
  );
  assert.throws(
    () => parseSpreadsheetWorkbook("csv", Buffer.from([0x61, 0x00, 0x62])),
    StudentImportOperationError,
  );
});
