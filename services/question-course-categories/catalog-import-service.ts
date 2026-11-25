import "server-only";

import path from "node:path";

import { prisma } from "@/lib/prisma";
import { GovernanceOperationError } from "@/services/admin/governance-errors";
import type { AIProvider } from "@/services/ai/provider";
import { createAIProvider } from "@/services/ai/provider-factory";
import { courseFileUploadConfig } from "@/services/course-files/config";
import {
  buildCatalogAIInput,
  catalogNamePool,
  courseNameKey,
  extractWorkbookCatalog,
  mergeCatalogWithAI,
  ruleCatalogCandidates,
} from "@/services/question-course-categories/catalog-extractor";
import {
  courseCatalogAIOutputSchema,
  type CourseCatalogAICourse,
  type CourseCatalogAIInput,
  type CourseCategoryImportCandidate,
  type CourseCategoryImportPreview,
} from "@/services/question-course-categories/catalog-schemas";
import { requireUserSchoolId } from "@/services/schools/tenant";
import { parseSpreadsheetWorkbook } from "@/services/student-imports/spreadsheet-parser";

const MAX_CANDIDATES = 300;
const MAX_AI_ROWS = 200;
const DEFAULT_AI_TIMEOUT_MS = 25_000;

export interface CourseCategoryImportDependencies {
  provider?: AIProvider | null;
}

function extensionOf(fileName: string): "csv" | "xls" | "xlsx" {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".csv") return "csv";
  if (extension === ".xls") return "xls";
  if (extension === ".xlsx") return "xlsx";
  throw new GovernanceOperationError(
    "只支持 .xls、.xlsx 或 .csv 格式的教学计划表。",
    400,
  );
}

function aiTimeoutMs(): number {
  const parsed = Number(process.env.COURSE_CATALOG_AI_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, 60_000)
    : DEFAULT_AI_TIMEOUT_MS;
}

interface AICatalogResult {
  courses: CourseCatalogAICourse[];
  note: string | null;
}

/**
 * 调用统一 AI 层识别课程清单。AI 不可用或输出不合约时返回空清单，
 * 由调用方回落到规则识别，不阻断导入预览。
 */
async function runAICatalogExtraction(
  provider: AIProvider | null,
  input: CourseCatalogAIInput,
): Promise<AICatalogResult> {
  if (!provider?.extractCourseCatalog) {
    return { courses: [], note: "AI 识别未启用，已按表格规则识别。" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), aiTimeoutMs());
  try {
    let validationError: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await provider.extractCourseCatalog(input, {
        signal: controller.signal,
        validationError,
      });
      const parsed = courseCatalogAIOutputSchema.safeParse(raw);
      if (parsed.success) return { courses: parsed.data.courses, note: null };
      validationError = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "root"}:${issue.message}`)
        .join("；");
    }
    return {
      courses: [],
      note: "AI 返回的课程结构不符合要求，已按表格规则识别，请核对列表。",
    };
  } catch {
    return {
      courses: [],
      note: "AI 识别暂不可用，已按表格规则识别，请核对列表。",
    };
  } finally {
    clearTimeout(timer);
  }
}

function providerFor(
  actorId: string,
  dependencies: CourseCategoryImportDependencies,
) {
  if (dependencies.provider !== undefined) return dependencies.provider;
  try {
    return createAIProvider({ capability: "course_catalog", actorId });
  } catch {
    return null;
  }
}

export async function previewCourseCategoryImport(
  actorId: string,
  file: File,
  dependencies: CourseCategoryImportDependencies = {},
): Promise<CourseCategoryImportPreview> {
  const fileName = file.name?.trim();
  if (!fileName) {
    throw new GovernanceOperationError("请选择要识别的教学计划表。", 400);
  }
  const format = extensionOf(fileName);
  if (file.size > courseFileUploadConfig.maxFileSizeBytes) {
    throw new GovernanceOperationError(
      `文件超过 ${Math.round(courseFileUploadConfig.maxFileSizeBytes / 1024 / 1024)} MB 限制，请拆分后再上传。`,
      400,
    );
  }
  if (file.size === 0) {
    throw new GovernanceOperationError("文件内容为空，请重新选择。", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let workbook;
  try {
    workbook = parseSpreadsheetWorkbook(format, buffer);
  } catch {
    throw new GovernanceOperationError(
      "无法解析该表格文件，请确认文件未加密、未损坏，或另存为 .xlsx 后重试。",
      400,
    );
  }

  const table = extractWorkbookCatalog(workbook);
  if (!table) {
    throw new GovernanceOperationError(
      "未在文件中识别到课程清单，请确认表格包含「课程名称」列且下方有课程行。",
      400,
    );
  }

  const sheet = workbook.sheets.find((item) => item.index === table.sheetIndex);
  const namePool = sheet ? catalogNamePool(sheet) : new Set<string>();
  const schoolId = await requireUserSchoolId(actorId);
  const existing = await prisma.questionCourseCategory.findMany({
    where: { schoolId },
    select: { normalizedName: true },
  });
  const existingKeys = new Set(existing.map((item) => item.normalizedName));

  const ai = await runAICatalogExtraction(
    providerFor(actorId, dependencies),
    buildCatalogAIInput(table, fileName, { maxRows: MAX_AI_ROWS }),
  );
  const merged = ai.courses.length
    ? mergeCatalogWithAI(table, ai.courses, { namePool, existingKeys })
    : null;
  const candidates: Array<CourseCategoryImportCandidate> = (
    merged
      ? merged.candidates
      : ruleCatalogCandidates(table, existingKeys).map((row) => ({ ...row }))
  )
    .slice(0, MAX_CANDIDATES)
    .map((row) => ({
      key: courseNameKey(row.name),
      name: row.name,
      courseNo: row.courseNo,
      credits: row.credits,
      hours: row.hours,
      term: row.term,
      category: row.category,
      nature: row.nature,
      rowNumber: row.rowNumber ?? null,
      exists: row.exists,
    }));

  if (!candidates.length) {
    throw new GovernanceOperationError(
      "文件里没有可用的课程行，请检查课程名称列是否有内容。",
      400,
    );
  }

  const existingCount = candidates.filter((item) => item.exists).length;
  const ignored = Math.max(0, table.rows.length - candidates.length);
  const warnings: string[] = [];
  if (ai.note) warnings.push(ai.note);
  if (merged && merged.unverifiedCount > 0) {
    warnings.push(
      `${merged.unverifiedCount} 个 AI 返回的课程名未在表格中原样出现，已忽略，请补充识别或手工添加。`,
    );
  }
  if (merged && merged.duplicateCount > 0) {
    warnings.push(
      `${merged.duplicateCount} 门课程在表格中重复出现，已合并为一条。`,
    );
  }
  if (!merged && table.duplicateCount > 0) {
    warnings.push(
      `${table.duplicateCount} 门课程在表格中重复出现，已合并为一条。`,
    );
  }
  if (ignored > 0) {
    warnings.push(
      `${ignored} 行未被识别为课程（合计、学分要求或说明文字），如为正式课程请手工添加。`,
    );
  }
  if (existingCount > 0) {
    warnings.push(
      `${existingCount} 门课程已有同名分类，确认添加时会自动跳过。`,
    );
  }
  if (table.rows.length > MAX_CANDIDATES) {
    warnings.push(
      `单次最多识别 ${MAX_CANDIDATES} 门课程，超出部分请拆分文件后继续识别。`,
    );
  }

  return {
    fileName,
    format,
    sheetName: table.sheetName,
    headerRowNumber: table.headerRowNumber,
    extractor: merged ? "AI" : "RULE",
    aiNote: merged ? null : ai.note,
    candidates,
    warnings,
    summary: {
      total: candidates.length,
      available: candidates.length - existingCount,
      existing: existingCount,
      ignored,
    },
  };
}
