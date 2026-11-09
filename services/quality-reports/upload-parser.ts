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
  options: {
    components?: QualityReportSourceSnapshot["components"];
    classroomName?: string;
    roster?: Array<{
      studentNo: string;
      displayName: string;
      studentId: string | null;
    }>;
  } = {},
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
  const components =
    options.components ??
    FIXED_COMPONENTS.map(({ code, name, weight }) => ({ code, name, weight }));
  if (
    !components.length ||
    Math.abs(components.reduce((sum, item) => sum + item.weight, 0) - 1) >
      0.000001
  )
    throw new QualityReportOperationError(
      "请先确认正式考核项目及权重，权重合计须为100%。",
    );
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .replace(/\s+/gu, "")
      .replace(/\([^)]*\)/gu, "");
  const componentIndexes = components.map((component) => {
    const legacy = FIXED_COMPONENTS.find(
      (item) => item.name === component.name,
    );
    const aliases = [
      component.name,
      component.code,
      ...(legacy?.aliases ?? []),
    ].map(normalize);
    const matches = header.flatMap((value, index) =>
      aliases.includes(normalize(value)) ? [index] : [],
    );
    if (matches.length > 1)
      throw new QualityReportOperationError(
        `考核项目“${component.name}”存在重复成绩列。`,
      );
    const index = matches[0] ?? -1;
    const weight =
      index >= 0 ? header[index]!.match(/([\d.]+)\s*[%％]/u) : null;
    if (
      weight &&
      Math.abs(Number(weight[1]) / 100 - component.weight) > 0.000001
    )
      throw new QualityReportOperationError(
        `“${component.name}”表头权重与正式方案不一致，请核对后重新上传。`,
      );
    return index;
  });
  if (
    studentNoIndex < 0 ||
    nameIndex < 0 ||
    componentIndexes.some((index) => index < 0)
  )
    throw new QualityReportOperationError(
      "成绩文件缺少学号、姓名或正式考核项目成绩列。请使用对应班级的完整成绩工作簿。",
      400,
      "SOURCE_HEADERS_INVALID",
    );
  if (new Set(componentIndexes).size !== componentIndexes.length)
    throw new QualityReportOperationError(
      "多个考核项目匹配到了同一成绩列，请使用名称明确的正式成绩工作簿。",
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
  const classroomIndex = indexOf("教学班", "班级");
  const roster =
    options.roster === undefined
      ? null
      : new Map(options.roster.map((item) => [item.studentNo, item]));
  const fileClassrooms = new Set<string>();
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
    const fileClassroom =
      classroomIndex >= 0 ? (values[classroomIndex] ?? "") : "";
    if (fileClassroom) fileClassrooms.add(fileClassroom);
    if (
      options.classroomName &&
      classroomIndex >= 0 &&
      header[classroomIndex]!.includes("教学班") &&
      fileClassroom &&
      fileClassroom !== options.classroomName
    )
      throw new QualityReportOperationError(
        `第 ${row.rowNumber} 行教学班与所选班级不一致，请上传该班的成绩文件。`,
      );
    const member = roster?.get(studentNo);
    if (roster && (!member || member.displayName.trim() !== displayName))
      throw new QualityReportOperationError(
        `第 ${row.rowNumber} 行学号或姓名与所选班级名单不符，请核对班级及学生信息。`,
        400,
        "UPLOAD_CLASSROOM_MISMATCH",
      );
    const effectiveStatus =
      statusIndex >= 0
        ? status(values[statusIndex] ?? "")
        : GradeValueStatus.SCORED;
    const componentScores = Object.fromEntries(
      components.map((component, index) => [
        component.code,
        values[componentIndexes[index]!] === "免修"
          ? null
          : numeric(values[componentIndexes[index]!] ?? ""),
      ]),
    );
    const componentStatuses = Object.fromEntries(
      components.map((component, index) => [
        component.code,
        values[componentIndexes[index]!] === "免修"
          ? "EXEMPT"
          : componentScores[component.code] === null
            ? "INCOMPLETE"
            : "COMPLETE",
      ]),
    );
    const included = components.filter(
      (component) => componentStatuses[component.code] !== "EXEMPT",
    );
    const complete =
      included.length > 0 &&
      included.every((component) => componentScores[component.code] !== null);
    const denominator = included.reduce(
      (sum, component) => sum + component.weight,
      0,
    );
    const computed =
      complete && denominator > 0
        ? included.reduce(
            (sum, component) =>
              sum + componentScores[component.code]! * component.weight,
            0,
          ) / denominator
        : null;
    const uploadedTotal =
      totalIndex >= 0 ? numeric(values[totalIndex] ?? "") : null;
    const resolvedTotal = uploadedTotal ?? computed;
    return {
      studentId: member?.studentId ?? null,
      studentNo,
      displayName,
      status:
        effectiveStatus === GradeValueStatus.SCORED && !complete
          ? GradeValueStatus.NOT_ENTERED
          : effectiveStatus,
      componentScores,
      componentStatuses,
      totalScore:
        effectiveStatus === GradeValueStatus.SCORED && resolvedTotal !== null
          ? Number(resolvedTotal.toFixed(2))
          : null,
    };
  });
  if (!roster && fileClassrooms.size > 1)
    throw new QualityReportOperationError(
      "文件包含多个班级，请拆分为单班成绩文件，或关联教学班后核对该班名单。",
      400,
      "UPLOAD_MULTIPLE_CLASSROOMS",
    );
  return {
    components,
    students,
  };
}
