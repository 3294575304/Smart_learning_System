import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";

import { buildQualityReportWorkbook } from "@/services/quality-reports/xlsx-writer";
import { parseUploadedGradeWorkbook } from "@/services/quality-reports/upload-parser";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";
import { GradeValueStatus, QualityReportSourceType } from "@prisma/client";

function fixture(): QualityReportSourceSnapshot {
  return {
    course: {
      id: "cm0000000000000000000000",
      name: "Python",
      courseNo: "PY",
      term: "2025-1",
      teacherName: "教师",
      courseNature: "专业(必)",
      credits: 4,
      majorClass: "一班",
      college: "学院",
      major: "专业",
      teachingMethodDetails: "",
      scoringCriteria: "",
    },
    classroom: { id: null, name: "一班" },
    sourceType: QualityReportSourceType.UPLOAD,
    components: [
      { code: "regular", name: "平时表现", weight: 0.1 },
      { code: "assignment", name: "课程作业", weight: 0.05 },
      { code: "midterm", name: "期中考试", weight: 0.05 },
      { code: "experiment", name: "课程实验", weight: 0.2 },
      { code: "final", name: "期末考试", weight: 0.6 },
    ],
    students: [
      {
        studentId: null,
        studentNo: "001234567890123456",
        displayName: "学生",
        status: GradeValueStatus.SCORED,
        componentScores: {
          regular: 100,
          assignment: 90,
          midterm: 80,
          experiment: 70,
          final: 60,
        },
        totalScore: 68.5,
      },
    ],
    outcomes: [],
    attendance: { sessionCount: 0, presentRate: null },
    survey: null,
    sourceReference: {},
  };
}

test("生成的成绩计算工作簿保留文本学号、分项工作表和总评公式", () => {
  const workbook = buildQualityReportWorkbook(fixture());
  const parsed = parseUploadedGradeWorkbook("xlsx", workbook);
  assert.equal(parsed.students[0]?.studentNo, "001234567890123456");
  assert.equal(parsed.students[0]?.totalScore, 68.5);
  assert.equal(parsed.components.length, 5);
});
import { parseSpreadsheetWorkbook } from "@/services/student-imports/spreadsheet-parser";
import { gradeExportFormatSchema } from "@/services/gradebook/schemas";

test("完整成绩单不漏学生，保留零分、前导零学号和特殊状态，并显示正式权重", () => {
  const source = fixture();
  const base = source.students[0]!;
  source.students = Array.from({ length: 96 }, (_, index) => ({
    ...base,
    studentNo: `000${index}`,
    displayName: `验收学生${index}`,
  }));
  source.students[0] = {
    ...base,
    studentNo: "0000",
    totalScore: 0,
    totalScoreOverridden: true,
  };
  source.students[1] = {
    ...base,
    studentNo: "0001",
    status: GradeValueStatus.DEFERRED,
    totalScore: null,
  };
  source.students[2] = {
    ...base,
    studentNo: "0002",
    status: GradeValueStatus.NOT_ENTERED,
    totalScore: null,
    componentScores: { ...base.componentScores, final: null },
  };
  const parsed = parseSpreadsheetWorkbook(
    "xlsx",
    buildQualityReportWorkbook(source),
  );
  assert.deepEqual(
    parsed.sheets.map((sheet) => sheet.name),
    [
      "总评",
      "平时表现",
      "课程作业",
      "期中考试",
      "课程实验",
      "期末考试",
      "导出说明",
    ],
  );
  for (const sheet of parsed.sheets.slice(0, 6))
    assert.equal(sheet.rows.length, 97);
  const total = parsed.sheets[0]!;
  assert.match(total.rows[0]!.cells[2]!.value, /10%/);
  assert.match(total.rows[0]!.cells[6]!.value, /60%/);
  assert.equal(total.rows[1]!.cells[0]!.value, "0000");
  assert.equal(total.rows[1]!.cells[7]!.value, "0");
  assert.equal(total.rows[1]!.cells[7]!.hasFormula, false);
  assert.equal(total.rows[1]!.cells[9]!.hasFormula, true);
  assert.equal(total.rows[1]!.cells[10]!.value, "采用已确认总评");
  assert.equal(total.rows[2]!.cells[8]!.value, "缓考");
  assert.equal(total.rows[3]!.cells[7]!.value, "");
  assert.equal(total.rows[3]!.cells[9]!.value, "");
  assert.equal(total.rows[3]!.cells[6]!.hasFormula, true);
});

test("免修分项不当零分，计算参考重分配其余权重且不改写正式总评", () => {
  const source = fixture();
  source.students[0] = {
    ...source.students[0]!,
    componentScores: {
      regular: 100,
      assignment: 100,
      midterm: 100,
      experiment: 100,
      final: null,
    },
    componentStatuses: { final: "EXEMPT" },
    totalScore: 100,
  };
  const parsed = parseSpreadsheetWorkbook(
    "xlsx",
    buildQualityReportWorkbook(source),
  );
  assert.equal(parsed.sheets[0]!.rows[1]!.cells[9]!.value, "100");
  assert.equal(parsed.sheets[5]!.rows[1]!.cells[3]!.value, "免修");
  assert.equal(parsed.sheets[0]!.rows[1]!.cells[7]!.hasFormula, false);
});

test("导出仅支持完整成绩单，拒绝旧模板和未知格式", () => {
  assert.equal(gradeExportFormatSchema.parse("workbook"), "workbook");
  assert.equal(gradeExportFormatSchema.safeParse("template").success, false);
  assert.equal(gradeExportFormatSchema.safeParse("csv").success, false);
});

function xmlEntry(data: Buffer, name: string): string {
  let offset = 0;
  while (data.readUInt32LE(offset) === 0x04034b50) {
    const length = data.readUInt32LE(offset + 18);
    const nameLength = data.readUInt16LE(offset + 26);
    const extraLength = data.readUInt16LE(offset + 28);
    const fileName = data
      .subarray(offset + 30, offset + 30 + nameLength)
      .toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    if (fileName === name)
      return inflateRawSync(data.subarray(start, start + length)).toString(
        "utf8",
      );
    offset = start + length;
  }
  throw new Error(`Missing workbook entry: ${name}`);
}
test("成绩工作簿正文居中，冻结身份列，打印重复表头且保留数字格式", () => {
  const source = fixture();
  source.students.push({
    ...source.students[0]!,
    studentNo: "00002",
    displayName: "较长姓名用于排版核验",
  });
  const workbook = buildQualityReportWorkbook(source);
  const styles = xmlEntry(workbook, "xl/styles.xml");
  const cellStyles =
    styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/u)?.[1] ?? "";
  assert.equal(
    [...cellStyles.matchAll(/horizontal="center" vertical="center"/gu)].length,
    7,
  );
  assert.match(styles, /numFmtId="2"/u);
  assert.match(styles, /numFmtId="49"/u);
  const sheet = xmlEntry(workbook, "xl/worksheets/sheet1.xml");
  assert.match(sheet, /xSplit="2" ySplit="1" topLeftCell="C2"/u);
  assert.match(
    sheet,
    /orientation="landscape" fitToWidth="1" fitToHeight="0"/u,
  );
  assert.match(sheet, /<row r="2" ht="26" customHeight="1">/u);
  assert.match(sheet, /<c r="H2" s="4"><v>68.5<\/v>/u);
  assert.match(sheet, /<c r="H3" s="7"><v>68.5<\/v>/u);
  assert.match(xmlEntry(workbook, "xl/workbook.xml"), /_xlnm.Print_Titles/u);
  assert.doesNotMatch(
    xmlEntry(workbook, "xl/worksheets/sheet7.xml"),
    /<autoFilter/u,
  );
});
