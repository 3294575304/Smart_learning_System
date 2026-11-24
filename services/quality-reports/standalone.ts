import "server-only";

import { createHash } from "node:crypto";
import { GradeValueStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { COURSE_SURVEY_MIN_SAMPLE_SIZE } from "@/services/course-surveys/constants";
import { parseSpreadsheetWorkbook } from "@/services/student-imports/spreadsheet-parser";
import type { AuditRequestContext } from "@/services/audit/types";
import { QualityReportOperationError } from "./errors";
import {
  QUALITY_REPORT_MAX_ROWS,
  QUALITY_REPORT_MAX_SOURCE_BYTES,
} from "./constants";
import { calculateUploadedOutcomeAttainment } from "./outcome-calculation";
import { calculateQualityReportStatistics } from "./calculation";
import { queueReport, type ReportUploadFile } from "./service";
import { resolveReportTemplate } from "./template-service";
import { qualityReportSourceSnapshotSchema } from "./schemas";
import { templateSelectionShape } from "./template-schema";

const column = z.string().trim().min(1).max(300);
const component = z
  .object({
    code: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(300),
    column,
    weight: z.number().min(0).max(1),
  })
  .strict();
export const standaloneInputSchema = z
  .object({
    courseName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine(
        (value) => /python/iu.test(value),
        "当前仅支持 Python 程序设计课程。",
      ),
    courseNo: z.string().trim().max(100).default(""),
    term: z.string().trim().min(1).max(100),
    teacherName: z.string().trim().min(1).max(100),
    classroomName: z.string().trim().min(1).max(200),
    courseNature: z.string().trim().max(50).default(""),
    credits: z.number().min(0).max(20).default(0),
    college: z.string().trim().max(200).default(""),
    major: z.string().trim().max(200).default(""),
    teachingMethodDetails: z.string().trim().max(2000).default(""),
    scoringCriteria: z.string().trim().max(2000).default(""),
    grade: z
      .object({
        studentNoColumn: column.optional(),
        nameColumn: column.optional(),
        statusColumn: column.optional(),
        components: z.array(component).min(1).max(30),
      })
      .strict(),
    outcomes: z
      .array(
        z
          .object({
            code: z.string().trim().min(1).max(100),
            title: z.string().trim().min(1).max(300),
            threshold: z.number().min(0).max(1),
            allocations: z
              .array(
                z
                  .object({
                    componentCode: z.string(),
                    rate: z.number().min(0).max(1),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    survey: z
      .object({
        responseCount: z.number().int().nonnegative(),
        eligibleCount: z.number().int().positive(),
        kindColumn: column,
        codeColumn: column.optional(),
        titleColumn: column,
        countColumn: column,
        meanColumn: column,
      })
      .strict(),
    ...templateSelectionShape,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      Math.abs(
        value.grade.components.reduce((sum, item) => sum + item.weight, 0) - 1,
      ) > 0.000001
    )
      ctx.addIssue({
        code: "custom",
        message: "成绩项目权重之和必须为 100%。",
      });
    const codes = value.grade.components.map((item) => item.code);
    if (
      new Set(codes).size !== codes.length ||
      new Set(value.outcomes.map((item) => item.code)).size !==
        value.outcomes.length
    )
      ctx.addIssue({
        code: "custom",
        message: "成绩项目和课程目标编码不能重复。",
      });
    for (const outcome of value.outcomes) {
      if (
        new Set(outcome.allocations.map((item) => item.componentCode)).size !==
        outcome.allocations.length
      )
        ctx.addIssue({
          code: "custom",
          message: `课程目标 ${outcome.code} 的成绩项目不能重复。`,
        });
      if (
        outcome.allocations.some((item) => !codes.includes(item.componentCode))
      )
        ctx.addIssue({
          code: "custom",
          message: "课程目标映射包含不存在的成绩项目。",
        });
    }
    for (const code of codes) {
      const total = value.outcomes
        .flatMap((item) => item.allocations)
        .filter((item) => item.componentCode === code)
        .reduce((sum, item) => sum + item.rate, 0);
      if (Math.abs(total - 1) > 0.000001)
        ctx.addIssue({
          code: "custom",
          message: `成绩项目 ${code} 对各目标的分配比例必须合计 100%。`,
        });
    }
    if (value.survey.responseCount > value.survey.eligibleCount)
      ctx.addIssue({
        code: "custom",
        message: "问卷有效回答数不能超过应答人数。",
      });
  });

type Sheet = ReturnType<typeof parseSpreadsheetWorkbook>["sheets"][number];
function workbook(file: { name: string; data: Buffer }): Sheet {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "xls" && extension !== "xlsx" && extension !== "csv")
    throw new QualityReportOperationError(
      "数据文件仅支持 XLS、XLSX 或 CSV。",
      400,
    );
  let parsed;
  try {
    parsed = parseSpreadsheetWorkbook(extension, file.data);
  } catch {
    throw new QualityReportOperationError("数据文件无法解析。", 400);
  }
  const sheet = parsed.sheets[0];
  if (!sheet?.rows.length)
    throw new QualityReportOperationError("数据文件为空。", 400);
  const headers = cells(sheet.rows[0]!);
  if (headers.some((item) => !item) || new Set(headers).size !== headers.length)
    throw new QualityReportOperationError("数据文件表头不能留空或重复。", 400);
  return sheet;
}
function cells(row: Sheet["rows"][number]) {
  return row.cells.map((item) => item.value.trim());
}
function rows(sheet: Sheet) {
  return sheet.rows
    .slice(1)
    .filter((row) => row.cells.some((cell) => cell.value.trim()));
}
function field(header: string[], name: string | undefined, required = true) {
  const index = name ? header.indexOf(name) : -1;
  if (required && index < 0)
    throw new QualityReportOperationError(
      `文件中找不到“${name ?? "未选择"}”列。`,
      400,
    );
  return index;
}
function score(raw: string, row: number, label: string) {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new QualityReportOperationError(
      `第 ${row} 行“${label}”须为 0–100 的分数。`,
      400,
    );
  return value;
}
function readFile(file: ReportUploadFile | null, label: string) {
  if (!file || file.size < 1 || file.size > QUALITY_REPORT_MAX_SOURCE_BYTES)
    throw new QualityReportOperationError(
      `${label}必须为 10 MB 以内的非空文件。`,
      400,
    );
  return file.arrayBuffer().then((data) => {
    if (
      data.byteLength !== file.size ||
      data.byteLength > QUALITY_REPORT_MAX_SOURCE_BYTES
    )
      throw new QualityReportOperationError(`${label}大小无效。`, 400);
    return { name: file.name, data: Buffer.from(data), mimeType: file.type };
  });
}
export async function previewStandaloneWorkbook(file: ReportUploadFile | null) {
  const data = await readFile(file, "数据文件");
  const sheet = workbook(data);
  return {
    sheetName: sheet.name,
    headers: cells(sheet.rows[0]!),
    rowCount: rows(sheet).length,
  };
}

async function prepareStandaloneQualityReport(
  teacherId: string,
  rawInput: unknown,
  gradeFile: ReportUploadFile | null,
  surveyFile: ReportUploadFile | null,
) {
  const input = standaloneInputSchema.parse(rawInput);
  const [grade, survey] = await Promise.all([
    readFile(gradeFile, "成绩文件"),
    readFile(surveyFile, "问卷汇总文件"),
  ]);
  const gradeSheet = workbook(grade),
    surveySheet = workbook(survey);
  const gradeHeader = cells(gradeSheet.rows[0]!);
  const gradeRows = rows(gradeSheet);
  if (!gradeRows.length || gradeRows.length > QUALITY_REPORT_MAX_ROWS)
    throw new QualityReportOperationError(
      "成绩文件须包含 1–2000 行学生数据。",
      400,
    );
  const idIndex = field(gradeHeader, input.grade.studentNoColumn, false),
    nameIndex = field(gradeHeader, input.grade.nameColumn, false),
    statusIndex = field(gradeHeader, input.grade.statusColumn, false);
  const componentIndexes = input.grade.components.map((item) =>
    field(gradeHeader, item.column),
  );
  if (new Set(componentIndexes).size !== componentIndexes.length)
    throw new QualityReportOperationError("多个成绩项目不能映射同一列。", 400);
  const seen = new Set<string>();
  const students = gradeRows.map((row) => {
    const values = cells(row),
      studentNo =
        idIndex >= 0
          ? values[idIndex] || `ROW-${row.rowNumber}`
          : `ROW-${row.rowNumber}`;
    if (seen.has(studentNo))
      throw new QualityReportOperationError(
        `第 ${row.rowNumber} 行学生标识重复。`,
        400,
      );
    seen.add(studentNo);
    const rawStatus =
      statusIndex >= 0 ? values[statusIndex]?.toUpperCase() : "";
    const status = (
      {
        "": GradeValueStatus.SCORED,
        正常: GradeValueStatus.SCORED,
        SCORED: GradeValueStatus.SCORED,
        缺考: GradeValueStatus.ABSENT,
        ABSENT: GradeValueStatus.ABSENT,
        缓考: GradeValueStatus.DEFERRED,
        DEFERRED: GradeValueStatus.DEFERRED,
        作弊: GradeValueStatus.CHEATING,
        CHEATING: GradeValueStatus.CHEATING,
        免修: GradeValueStatus.EXEMPT,
        EXEMPT: GradeValueStatus.EXEMPT,
        未录入: GradeValueStatus.NOT_ENTERED,
        NOT_ENTERED: GradeValueStatus.NOT_ENTERED,
      } as Record<string, GradeValueStatus>
    )[rawStatus ?? ""];
    if (!status)
      throw new QualityReportOperationError(
        `第 ${row.rowNumber} 行特殊状态无效。`,
        400,
      );
    const componentScores = Object.fromEntries(
      input.grade.components.map((item, index) => [
        item.code,
        score(values[componentIndexes[index]!] ?? "", row.rowNumber, item.name),
      ]),
    );
    const complete = Object.values(componentScores).every(
      (value) => value !== null,
    );
    const totalScore =
      status === GradeValueStatus.SCORED && complete
        ? Number(
            input.grade.components
              .reduce(
                (sum, item) =>
                  sum + Number(componentScores[item.code]) * item.weight,
                0,
              )
              .toFixed(2),
          )
        : null;
    return {
      studentId: null,
      studentNo,
      displayName:
        nameIndex >= 0
          ? values[nameIndex] || `第 ${row.rowNumber} 行`
          : `第 ${row.rowNumber} 行`,
      status:
        status === GradeValueStatus.SCORED && !complete
          ? GradeValueStatus.NOT_ENTERED
          : status,
      componentScores,
      totalScore,
    };
  });
  const surveyHeader = cells(surveySheet.rows[0]!),
    surveyRows = rows(surveySheet);
  if (!surveyRows.length || surveyRows.length > 200)
    throw new QualityReportOperationError(
      "问卷汇总文件须包含 1–200 行指标。",
      400,
    );
  const kind = field(surveyHeader, input.survey.kindColumn),
    code = field(surveyHeader, input.survey.codeColumn, false),
    title = field(surveyHeader, input.survey.titleColumn),
    count = field(surveyHeader, input.survey.countColumn),
    mean = field(surveyHeader, input.survey.meanColumn);
  const outcomes: Array<{
      code: string;
      title: string;
      count: number;
      mean: number;
    }> = [],
    dimensions: Array<{
      code: string;
      title: string;
      count: number;
      mean: number;
    }> = [],
    themes: Array<{ key: string; label: string; count: number }> = [];
  let overallMean: number | null = null;
  let hasOverall = false;
  const surveyOutcomeCodes = new Set<string>();
  const expectedOutcomeCodes = new Set(
    input.outcomes.map((item) =>
      item.code.normalize("NFKC").replace(/\s+/gu, "").toLowerCase(),
    ),
  );
  for (const row of surveyRows) {
    const values = cells(row),
      rowKind = values[kind]?.toUpperCase(),
      rowCount = Number(values[count]);
    if (
      !Number.isInteger(rowCount) ||
      rowCount < 0 ||
      rowCount > input.survey.responseCount
    )
      throw new QualityReportOperationError(
        `问卷第 ${row.rowNumber} 行样本数无效。`,
        400,
      );
    const label = values[title] ?? "",
      rowCode = code >= 0 ? values[code] || label : label;
    if (!label)
      throw new QualityReportOperationError(
        `问卷第 ${row.rowNumber} 行缺少指标名称。`,
        400,
      );
    if (rowKind === "THEME" || rowKind === "主题") {
      if (rowCount) themes.push({ key: rowCode, label, count: rowCount });
      continue;
    }
    const rowMean = Number(values[mean]);
    if (rowCount && (!Number.isFinite(rowMean) || rowMean < 1 || rowMean > 5))
      throw new QualityReportOperationError(
        `问卷第 ${row.rowNumber} 行均值须为 1–5。`,
        400,
      );
    if (rowKind === "OVERALL" || rowKind === "总体") {
      if (hasOverall)
        throw new QualityReportOperationError(
          "问卷汇总文件只能有一行总体指标。",
          400,
        );
      hasOverall = true;
      overallMean = rowCount ? rowMean : null;
    } else if (rowKind === "OUTCOME" || rowKind === "目标") {
      const normalizedCode = rowCode
        .normalize("NFKC")
        .replace(/\s+/gu, "")
        .toLowerCase();
      if (!expectedOutcomeCodes.has(normalizedCode))
        throw new QualityReportOperationError(
          `问卷第 ${row.rowNumber} 行目标编码与上方课程目标不一致。`,
          400,
        );
      if (surveyOutcomeCodes.has(normalizedCode))
        throw new QualityReportOperationError(
          `问卷第 ${row.rowNumber} 行课程目标重复。`,
          400,
        );
      surveyOutcomeCodes.add(normalizedCode);
      if (rowCount)
        outcomes.push({
          code: rowCode,
          title: label,
          count: rowCount,
          mean: rowMean,
        });
    } else if (rowKind === "DIMENSION" || rowKind === "维度") {
      if (rowCount)
        dimensions.push({
          code: rowCode,
          title: label,
          count: rowCount,
          mean: rowMean,
        });
    } else
      throw new QualityReportOperationError(
        `问卷第 ${row.rowNumber} 行类型须为总体、目标、维度或主题。`,
        400,
      );
  }
  if (
    input.survey.responseCount > 0 &&
    !outcomes.length &&
    !dimensions.length &&
    overallMean === null
  )
    throw new QualityReportOperationError(
      "问卷汇总文件缺少可用的量表或目标统计。",
      400,
    );
  const suppressed = input.survey.responseCount < COURSE_SURVEY_MIN_SAMPLE_SIZE;
  const reportSurvey = {
    surveyId: null,
    title: "外部问卷汇总",
    mode: "ANONYMOUS" as const,
    summaryRevisionId: null,
    summaryRevisionNumber: 1,
    responseCount: input.survey.responseCount,
    eligibleCount: input.survey.eligibleCount,
    responseRate: input.survey.responseCount / input.survey.eligibleCount,
    minSampleSize: COURSE_SURVEY_MIN_SAMPLE_SIZE,
    isSuppressed: suppressed,
    overallMean: suppressed ? null : overallMean,
    outcomes: suppressed ? [] : outcomes,
    dimensions: suppressed ? [] : dimensions,
    themes: suppressed ? [] : themes,
    themeNarrative: suppressed
      ? "样本不足，已隐藏开放题主题。"
      : themes.length
        ? themes.map((item) => `${item.label}（${item.count}）`).join("；")
        : "暂无开放题主题。",
    ruleVersion: "standalone-survey-v1",
  };
  const components = input.grade.components.map(
    ({ code: itemCode, name, weight }) => ({ code: itemCode, name, weight }),
  );
  const outcomeSource = input.outcomes.map((item) => ({
    code: item.code,
    title: item.title,
    threshold: item.threshold,
    attainmentIndex: null,
    participantCount: 0,
    componentAllocations: item.allocations.map((allocation) => ({
      componentCode: allocation.componentCode,
      allocationRate: allocation.rate,
    })),
    studentScores: [],
  }));
  const reportTemplate = await resolveReportTemplate(teacherId, null, input);
  if (!reportTemplate)
    throw new QualityReportOperationError("请先上传并确认报告模板。", 400);
  const source = qualityReportSourceSnapshotSchema.parse({
    course: {
      id: null,
      name: input.courseName,
      courseNo: input.courseNo,
      term: input.term,
      teacherName: input.teacherName,
      courseNature: input.courseNature,
      credits: input.credits,
      majorClass: input.classroomName,
      college: input.college,
      major: input.major,
      teachingMethodDetails: input.teachingMethodDetails,
      scoringCriteria: input.scoringCriteria,
    },
    classroom: { id: null, name: input.classroomName },
    reportTemplate,
    sourceType: "UPLOAD",
    components,
    students,
    outcomes: calculateUploadedOutcomeAttainment(
      components,
      students,
      outcomeSource,
    ),
    attendance: { sessionCount: 0, presentRate: null },
    survey: reportSurvey,
    syllabus: null,
    sourceReference: {
      standalone: true,
      ownerId: teacherId,
      gradeFileName: grade.name,
      gradeChecksumSha256: createHash("sha256")
        .update(grade.data)
        .digest("hex"),
      surveyFileName: survey.name,
      surveyChecksumSha256: createHash("sha256")
        .update(survey.data)
        .digest("hex"),
    },
  });
  return {
    source,
    upload: {
      data: grade.data,
      extension: grade.name.split(".").pop()!.toLowerCase() as
        "xls" | "xlsx" | "csv",
      fileName: grade.name,
      mimeType: grade.mimeType || "application/octet-stream",
      checksum: source.sourceReference.gradeChecksumSha256 as string,
    },
  };
}

export async function previewStandaloneQualityReport(
  teacherId: string,
  input: unknown,
  gradeFile: ReportUploadFile | null,
  surveyFile: ReportUploadFile | null,
) {
  const { source } = await prepareStandaloneQualityReport(
    teacherId,
    input,
    gradeFile,
    surveyFile,
  );
  const statistics = calculateQualityReportStatistics(source);
  return {
    courseName: source.course.name,
    templateName: source.reportTemplate?.name,
    participantCount: statistics.participantCount,
    excludedCount: statistics.excludedCount,
    mean: statistics.mean,
    distribution: statistics.distribution,
    components: statistics.componentMeans,
    outcomes: statistics.outcomes.map((item) => ({
      code: item.code,
      title: item.title,
      attainmentIndex: item.attainmentIndex,
      threshold: item.threshold,
      participantCount: item.participantCount,
    })),
    survey: source.survey
      ? {
          responseCount: source.survey.responseCount,
          eligibleCount: source.survey.eligibleCount,
          responseRate: source.survey.responseRate,
          isSuppressed: source.survey.isSuppressed,
          overallMean: source.survey.overallMean,
          outcomeCount: source.survey.outcomes.length,
          dimensionCount: source.survey.dimensions.length,
        }
      : null,
  };
}

export async function queueStandaloneQualityReport(
  teacherId: string,
  input: unknown,
  gradeFile: ReportUploadFile | null,
  surveyFile: ReportUploadFile | null,
  context: AuditRequestContext,
) {
  const { source, upload } = await prepareStandaloneQualityReport(
    teacherId,
    input,
    gradeFile,
    surveyFile,
  );
  return queueReport(teacherId, null, source, context, upload);
}

export async function listStandaloneQualityReports(teacherId: string) {
  const reports = await prisma.courseQualityReport.findMany({
    where: {
      courseId: null,
      requestedById: teacherId,
      standaloneKey: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      versionNumber: true,
      sourceType: true,
      status: true,
      reviewStatus: true,
      aiStatus: true,
      narrativeSnapshotJson: true,
      reviewedNarrativeJson: true,
      reviewedAt: true,
      reviewComment: true,
      createdAt: true,
      backgroundJob: { select: { progress: true, errorCode: true } },
      sourceSnapshotJson: true,
    },
  });
  return reports.map(({ sourceSnapshotJson, ...report }) => {
    const source =
      qualityReportSourceSnapshotSchema.safeParse(sourceSnapshotJson);
    return {
      ...report,
      classroom: null,
      courseName: source.success ? source.data.course.name : "独立报告",
      templateName: source.success ? source.data.reportTemplate?.name : "",
    };
  });
}
