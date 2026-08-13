import { GradeValueStatus } from "@prisma/client";

import { QUALITY_REPORT_MAX_ROWS } from "@/services/quality-reports/constants";
import { QualityReportOperationError } from "@/services/quality-reports/errors";
import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";
import { parseSpreadsheetWorkbook } from "@/services/student-imports/spreadsheet-parser";

const FIXED_COMPONENTS = [
  {
    code: "regular",
    name: "平时表现",
    weight: 0.1,
    aliases: ["平时表现", "平时成绩"],
  },
  {
    code: "assignment",
    name: "课程作业",
    weight: 0.05,
    aliases: ["课程作业", "作业"],
  },
  {
    code: "midterm",
    name: "期中考试",
    weight: 0.05,
    aliases: ["期中考试", "期中成绩"],
  },
  {
    code: "experiment",
    name: "课程实验",
    weight: 0.2,
    aliases: ["课程实验", "实验成绩"],
  },
  {
    code: "final",
    name: "期末考试",
    weight: 0.6,
    aliases: ["期末考试", "期末成绩"],
  },
] as const;

function numeric(value: string): number | null {
  const normalized = value.trim().replace(/%$/u, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)
    throw new QualityReportOperationError(
      `成绩“${value}”不是 0-100 之间的数字。`,
    );
  return parsed;
}

function status(value: string): GradeValueStatus {
  const normalized = value.trim().toUpperCase();
  const mapping: Record<string, GradeValueStatus> = {
    "": GradeValueStatus.SCORED,
    缺考: GradeValueStatus.ABSENT,
    ABSENT: GradeValueStatus.ABSENT,
    缓考: GradeValueStatus.DEFERRED,
    DEFERRED: GradeValueStatus.DEFERRED,
    请假: GradeValueStatus.LEAVE,
    LEAVE: GradeValueStatus.LEAVE,
    免修: GradeValueStatus.EXEMPT,
    EXEMPT: GradeValueStatus.EXEMPT,
    作弊: GradeValueStatus.CHEATING,
    CHEATING: GradeValueStatus.CHEATING,
    未录入: GradeValueStatus.NOT_ENTERED,
    NOT_ENTERED: GradeValueStatus.NOT_ENTERED,
  };
  return mapping[normalized] ?? GradeValueStatus.OTHER;
}

export function parseUploadedGradeWorkbook(
  extension: "xls" | "xlsx" | "csv",
  data: Buffer,
): Pick<QualityReportSourceSnapshot, "components" | "students"> {
  let workbook;
  try {
    workbook = parseSpreadsheetWorkbook(extension, data);
  } catch {
    throw new QualityReportOperationError(
      "成绩文件无法解析，请使用平台导出的 XLSX 或标准表头文件。",
      400,
      "SOURCE_PARSE_FAILED",
    );
  }
  const sheet =
    workbook.sheets.find((item) => item.name.trim() === "总评") ??
    workbook.sheets[0];
  if (!sheet?.rows.length)
    throw new QualityReportOperationError(
      "成绩文件没有可读取的工作表。",
      400,
      "SOURCE_EMPTY",
    );
  const header = sheet.rows[0]!.cells.map((cell) => cell.value.trim());
  const indexOf = (...aliases: string[]) =>
    header.findIndex((value) => aliases.some((alias) => value.includes(alias)));
  const studentNoIndex = indexOf("学号");
  const nameIndex = indexOf("姓名");
  const statusIndex = indexOf("特殊状态", "特殊原因", "成绩标识");
  const totalIndex = indexOf("总评成绩", "总评");
  const componentIndexes = FIXED_COMPONENTS.map((component) =>
    indexOf(...component.aliases),
  );
  if (
    studentNoIndex < 0 ||
    nameIndex < 0 ||
    componentIndexes.some((index) => index < 0)
  )
    throw new QualityReportOperationError(
      "成绩文件缺少学号、姓名或五项固定成绩列。可先下载平台生成的成绩计算工作簿作为模板。",
      400,
      "SOURCE_HEADERS_INVALID",
    );
  const rows = sheet.rows
    .slice(1)
    .filter((row) => row.cells.some((cell) => cell.value.trim()));
  if (rows.length === 0 || rows.length > QUALITY_REPORT_MAX_ROWS)
    throw new QualityReportOperationError(
      rows.length === 0
        ? "成绩文件没有学生数据。"
        : `成绩文件最多支持 ${QUALITY_REPORT_MAX_ROWS} 行。`,
    );
  const seen = new Set<string>();
  const students = rows.map((row) => {
    const values = row.cells.map((cell) => cell.value.trim());
    const studentNo = values[studentNoIndex] ?? "";
    const displayName = values[nameIndex] ?? "";
    if (!studentNo || !displayName)
      throw new QualityReportOperationError(
        `第 ${row.rowNumber} 行缺少学号或姓名。`,
      );
    if (seen.has(studentNo))
      throw new QualityReportOperationError(`学号 ${studentNo} 在文件中重复。`);
    seen.add(studentNo);
    const effectiveStatus =
      statusIndex >= 0
        ? status(values[statusIndex] ?? "")
        : GradeValueStatus.SCORED;
    const componentScores = Object.fromEntries(
      FIXED_COMPONENTS.map((component, index) => [
        component.code,
        numeric(values[componentIndexes[index]!] ?? ""),
      ]),
    );
    const complete = Object.values(componentScores).every(
      (value) => value !== null,
    );
    const computed = complete
      ? FIXED_COMPONENTS.reduce(
          (sum, component) =>
            sum + componentScores[component.code]! * component.weight,
          0,
        )
      : null;
    const uploadedTotal =
      totalIndex >= 0 ? numeric(values[totalIndex] ?? "") : null;
    const resolvedTotal = uploadedTotal ?? computed;
    return {
      studentId: null,
      studentNo,
      displayName,
      status:
        effectiveStatus === GradeValueStatus.SCORED && !complete
          ? GradeValueStatus.NOT_ENTERED
          : effectiveStatus,
      componentScores,
      totalScore:
        effectiveStatus === GradeValueStatus.SCORED && resolvedTotal !== null
          ? Number(resolvedTotal.toFixed(2))
          : null,
    };
  });
  return {
    components: FIXED_COMPONENTS.map(({ code, name, weight }) => ({
      code,
      name,
      weight,
    })),
    students,
  };
}
