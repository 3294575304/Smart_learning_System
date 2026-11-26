import "server-only";

import path from "node:path";

import { normalizeCourseNo } from "@/lib/course-no";
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
  type CourseCategoryImportAction,
  type CourseCategoryImportCandidate,
  type CourseCategoryImportConflict,
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
    select: { id: true, normalizedName: true, courseNo: true },
  });
  const existingKeys = new Set(existing.map((item) => item.normalizedName));
  const existingByName = new Map(
    existing.map((item) => [item.normalizedName, item] as const),
  );
  const existingByCourseNo = new Map(
    existing
      .filter(
        (item): item is (typeof existing)[number] & { courseNo: string } =>
          item.courseNo !== null,
      )
      .map((item) => [item.courseNo, item] as const),
  );

  const ai = await runAICatalogExtraction(
    providerFor(actorId, dependencies),
    buildCatalogAIInput(table, fileName, { maxRows: MAX_AI_ROWS }),
  );
  const merged = ai.courses.length
    ? mergeCatalogWithAI(table, ai.courses, { namePool, existingKeys })
    : null;

  // 先统一课程号形态，再按「文件内同名/同号」与「库内同名/同号」分类。
  const baseCandidates: CourseCategoryImportCandidate[] = (
    merged
      ? merged.candidates
      : ruleCatalogCandidates(table, existingKeys).map((row) => ({ ...row }))
  )
    .slice(0, MAX_CANDIDATES)
    .map((row, index) => {
      const nameKey = courseNameKey(row.name);
      const existingCategory = existingByName.get(nameKey);
      return {
        key: `${nameKey}#${row.rowNumber ?? index}`,
        name: row.name,
        courseNo: normalizeCourseNo(row.courseNo),
        credits: row.credits,
        hours: row.hours,
        term: row.term,
        category: row.category,
        nature: row.nature,
        rowNumber: row.rowNumber ?? null,
        exists: Boolean(existingCategory),
        existingCategoryId: existingCategory?.id ?? null,
        existingCourseNo: existingCategory?.courseNo ?? null,
        action: "CREATE" as CourseCategoryImportAction,
        conflicts: [] as CourseCategoryImportConflict[],
      };
    });

  if (!baseCandidates.length) {
    throw new GovernanceOperationError(
      "文件里没有可用的课程行，请检查课程名称列是否有内容。",
      400,
    );
  }

  const fileNameIndex = new Map<string, Set<string>>();
  const fileCourseNoIndex = new Map<string, Set<string>>();
  for (const candidate of baseCandidates) {
    if (!candidate.courseNo) continue;
    const nameKey = courseNameKey(candidate.name);
    const numbers = fileNameIndex.get(nameKey) ?? new Set<string>();
    numbers.add(candidate.courseNo);
    fileNameIndex.set(nameKey, numbers);
    const names =
      fileCourseNoIndex.get(candidate.courseNo) ?? new Set<string>();
    names.add(nameKey);
    fileCourseNoIndex.set(candidate.courseNo, names);
  }

  const candidates = baseCandidates.map((candidate) => {
    const conflicts: CourseCategoryImportConflict[] = [];
    const nameKey = courseNameKey(candidate.name);
    const existingCategory = existingByName.get(nameKey);
    let action: CourseCategoryImportAction = "CREATE";

    if (!candidate.courseNo) {
      conflicts.push("MISSING_COURSE_NO");
    } else {
      if ((fileNameIndex.get(nameKey)?.size ?? 0) > 1) {
        conflicts.push("IN_FILE_NAME_CONFLICT");
      }
      if ((fileCourseNoIndex.get(candidate.courseNo)?.size ?? 0) > 1) {
        conflicts.push("IN_FILE_NO_CONFLICT");
      }
    }

    if (existingCategory) {
      if (existingCategory.courseNo === candidate.courseNo) {
        action = "SKIP";
      } else if (existingCategory.courseNo === null) {
        action = candidate.courseNo ? "BACKFILL" : "SKIP";
      } else {
        conflicts.push("EXISTING_NAME_NO_MISMATCH");
        action = "SKIP";
      }
    }

    if (candidate.courseNo) {
      const taken = existingByCourseNo.get(candidate.courseNo);
      if (taken && taken.id !== existingCategory?.id) {
        conflicts.push("COURSE_NO_TAKEN");
        if (action === "CREATE") action = "SKIP";
      }
    }

    return {
      ...candidate,
      exists: Boolean(existingCategory),
      existingCategoryId: existingCategory?.id ?? null,
      existingCourseNo: existingCategory?.courseNo ?? null,
      action,
      conflicts,
    };
  });

  const availableCount = candidates.filter(
    (item) => item.action === "CREATE" && item.conflicts.length === 0,
  ).length;
  const existingCount = candidates.filter(
    (item) => item.action === "SKIP",
  ).length;
  const backfillableCount = candidates.filter(
    (item) => item.action === "BACKFILL",
  ).length;
  const conflictCount = candidates.filter(
    (item) => item.conflicts.length > 0,
  ).length;
  const missingCourseNoCount = candidates.filter((item) =>
    item.conflicts.includes("MISSING_COURSE_NO"),
  ).length;
  const nameConflictCount = candidates.filter((item) =>
    item.conflicts.includes("IN_FILE_NAME_CONFLICT"),
  ).length;
  const noConflictCount = candidates.filter((item) =>
    item.conflicts.includes("IN_FILE_NO_CONFLICT"),
  ).length;
  const mismatchCount = candidates.filter((item) =>
    item.conflicts.includes("EXISTING_NAME_NO_MISMATCH"),
  ).length;
  const takenCount = candidates.filter((item) =>
    item.conflicts.includes("COURSE_NO_TAKEN"),
  ).length;
  const ignored = Math.max(0, table.rows.length - candidates.length);

  const warnings: string[] = [];
  if (ai.note) warnings.push(ai.note);
  if (merged && merged.unverifiedCount > 0) {
    warnings.push(
      `${merged.unverifiedCount} 个 AI 返回的课程名未在表格中原样出现，已忽略，请补充识别或手工添加。`,
    );
  }
  if (merged && merged.courseNoRejectedCount > 0) {
    warnings.push(
      `${merged.courseNoRejectedCount} 个 AI 返回的课程号与表格不一致，已改用表格原值。`,
    );
  }
  if (merged && merged.duplicateCount > 0) {
    warnings.push(
      `${merged.duplicateCount} 门课程在表格中完全重复（同名同号），已合并为一条。`,
    );
  }
  if (!merged && table.duplicateCount > 0) {
    warnings.push(
      `${table.duplicateCount} 门课程在表格中完全重复（同名同号），已合并为一条。`,
    );
  }
  if (ignored > 0) {
    warnings.push(
      `${ignored} 行未被识别为课程（合计、学分要求或说明文字），如为正式课程请手工添加。`,
    );
  }
  if (missingCourseNoCount > 0) {
    warnings.push(`${missingCourseNoCount} 门课程缺少课程号，补全后才能创建。`);
  }
  if (nameConflictCount > 0) {
    warnings.push(
      `${nameConflictCount} 门课程在表格中出现同名不同课程号，已分别列出，请确认是否为同一门课。`,
    );
  }
  if (noConflictCount > 0) {
    warnings.push(
      `${noConflictCount} 门课程的课程号在表格中被不同课程名重复使用，请核对后逐行修改。`,
    );
  }
  if (mismatchCount > 0) {
    warnings.push(
      `${mismatchCount} 门课程与已有分类同名但课程号不同，不会自动更新，请在列表中处理。`,
    );
  }
  if (takenCount > 0) {
    warnings.push(
      `${takenCount} 门课程的课程号已被其他分类占用，请核对后修改或跳过。`,
    );
  }
  if (backfillableCount > 0) {
    warnings.push(
      `${backfillableCount} 门已有分类缺少课程号，可用表格中的课程号回填（默认不勾选）。`,
    );
  }
  if (existingCount > 0) {
    warnings.push(
      `${existingCount} 门课程已存在同名分类且课程号一致，确认时会自动跳过。`,
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
      available: availableCount,
      existing: existingCount,
      ignored,
      backfillable: backfillableCount,
      conflicts: conflictCount,
      missingCourseNo: missingCourseNoCount,
    },
  };
}
