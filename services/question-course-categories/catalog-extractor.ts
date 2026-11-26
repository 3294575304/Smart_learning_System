import type {
  ParsedSpreadsheetSheet,
  ParsedSpreadsheetWorkbook,
} from "@/services/student-imports/spreadsheet-parser";

import { normalizeCourseNo } from "@/lib/course-no";
import type {
  CourseCatalogAICourse,
  CourseCatalogColumns,
  CourseCatalogRow,
  CourseCatalogTable,
} from "@/services/question-course-categories/catalog-schemas";

const HEADER_SCAN_ROWS = 30;
const MIN_HEADER_LABEL_LENGTH = 2;
const MAX_COURSE_NAME_LENGTH = 40;
const NAME_COLUMN_MAX_SCAN = 60;

const FIELD_ALIASES: Record<keyof CourseCatalogColumns, string[]> = {
  name: [
    "课程名称",
    "课程名",
    "课程",
    "科目名称",
    "科目名",
    "教学课程",
    "coursesname",
    "coursename",
  ],
  courseNo: [
    "课程号",
    "课程编号",
    "课程代码",
    "课程编码",
    "课程号编号",
    "courseno",
    "coursecode",
  ],
  credits: ["学分", "课程学分", "credit", "credits"],
  hours: ["总学时", "计划学时", "学时", "总课时", "课时", "hours"],
  term: ["开课学期", "学期", "开课学期周次", "开课时间", "term", "semester"],
  category: ["课程类别", "课程模块", "课程类型", "课程类别名称", "category"],
  nature: ["课程性质", "修读性质", "课程属性", "性质", "nature"],
};

const NOISE_NAME_PATTERN =
  /^(?:合计|小计|应修合计|总计|毕业总学分|总学分|总学时|备注|说明|注|小计合计|学分合计)$/u;

const SUMMARY_HINT_PATTERN = /(?:合计|总学分|总计)$/u;

// 培养要求、选课说明一类文字常占用课程名称列，用标点与「学分」提示排除。
const DESCRIPTION_HINT_PATTERN = /[，。；：、]|学分/u;

/** 去掉换行并把连续空白压成单个空格，用于展示与比较。 */
export function cleanCellText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\r\n]+/gu, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

/** 表头比较时忽略全部空白与括号后缀，兼容「开课\n学期」「总  学时」。 */
function headerKey(value: string): string {
  return cleanCellText(value)
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\u3000]+/gu, "")
    .replace(/[（(][^）)]*[)）]/gu, "");
}

/**
 * 课程名展示文本：只做 NFC 与换行合并，保留全角括号等原文写法，
 * 与用于去重的 NFKC 比较键分开，避免展示层被规范化改写。
 */
export function cleanCourseName(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\r\n]+/gu, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

/** 课程分类名称比较键：与分类服务 normalizedName 保持一致的语义。 */
export function courseNameKey(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("zh-CN");
}

function matchField(label: string): keyof CourseCatalogColumns | null {
  const key = headerKey(label);
  if (!key) return null;
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [keyof CourseCatalogColumns, string[]]
  >) {
    if (aliases.includes(key)) return field;
  }
  return null;
}

function detectHeader(
  sheet: ParsedSpreadsheetSheet,
): { rowNumber: number; columns: CourseCatalogColumns } | null {
  let best: {
    rowNumber: number;
    columns: CourseCatalogColumns;
    score: number;
  } | null = null;
  for (const row of sheet.rows) {
    if (row.rowNumber > HEADER_SCAN_ROWS) break;
    const columns: Partial<CourseCatalogColumns> = {};
    for (const cell of row.cells) {
      const label = cleanCellText(cell.value);
      if (label.length < MIN_HEADER_LABEL_LENGTH) continue;
      const field = matchField(label);
      if (!field || columns[field] !== undefined) continue;
      if (field === "name") columns.name = cell.columnIndex;
      else columns[field] = cell.columnIndex;
    }
    if (columns.name === undefined) continue;
    const score = Object.keys(columns).length;
    if (score < 2) continue;
    if (!best || score > best.score) {
      best = {
        rowNumber: row.rowNumber,
        columns: columns as CourseCatalogColumns,
        score,
      };
    }
  }
  return best ? { rowNumber: best.rowNumber, columns: best.columns } : null;
}

function cellAt(row: ParsedSpreadsheetSheet["rows"][number], column: number) {
  return row.cells.find((cell) => cell.columnIndex === column)?.value ?? "";
}

function isNoiseName(name: string): boolean {
  if (NOISE_NAME_PATTERN.test(name)) return true;
  if (SUMMARY_HINT_PATTERN.test(name) && name.length <= 8) return true;
  if (DESCRIPTION_HINT_PATTERN.test(name)) return true;
  return false;
}

/**
 * 从一张工作表里识别课程清单：定位表头、按列取值、跳过合计与说明行、
 * 处理合并单元格的类别/性质向下填充，并按名称去重。
 */
export function extractSheetCatalog(
  sheet: ParsedSpreadsheetSheet,
): CourseCatalogTable | null {
  const header = detectHeader(sheet);
  if (!header) return null;
  const { columns } = header;
  const rows: CourseCatalogRow[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  let category = "";
  let nature = "";

  for (const row of sheet.rows) {
    if (row.rowNumber <= header.rowNumber) continue;
    const rowCategory = cleanCellText(cellAt(row, columns.category ?? -1));
    if (rowCategory) category = rowCategory;
    const rowNature = cleanCellText(cellAt(row, columns.nature ?? -1));
    if (rowNature) nature = rowNature;

    const name = cleanCourseName(cellAt(row, columns.name));
    if (!name || name.length > MAX_COURSE_NAME_LENGTH) continue;
    if (isNoiseName(name)) continue;
    if (!/[\p{Script=Han}A-Za-z]/u.test(name)) continue;

    const courseNo =
      columns.courseNo === undefined
        ? ""
        : cleanCellText(cellAt(row, columns.courseNo));
    const credits =
      columns.credits === undefined
        ? ""
        : cleanCellText(cellAt(row, columns.credits));
    const hours =
      columns.hours === undefined
        ? ""
        : cleanCellText(cellAt(row, columns.hours));
    const term =
      columns.term === undefined
        ? ""
        : cleanCellText(cellAt(row, columns.term));
    if (!courseNo && !credits && !hours && !term) continue;

    // 同名但课程号不同的行必须分别保留，交给预览阶段提示人工确认。
    const key = `${courseNameKey(name)}|${normalizeCourseNo(courseNo)}`;
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    rows.push({
      rowNumber: row.rowNumber,
      name,
      courseNo,
      credits,
      hours,
      term,
      category,
      nature,
    });
  }

  if (!rows.length) return null;
  return {
    sheetName: sheet.name,
    sheetIndex: sheet.index,
    headerRowNumber: header.rowNumber,
    columns,
    rows,
    duplicateCount,
  };
}

/** 多工作表时取课程行最多的一张，其次取表头字段最全的一张。 */
export function extractWorkbookCatalog(
  workbook: ParsedSpreadsheetWorkbook,
): CourseCatalogTable | null {
  let best: CourseCatalogTable | null = null;
  for (const sheet of workbook.sheets) {
    if (sheet.hidden) continue;
    const table = extractSheetCatalog(sheet);
    if (!table) continue;
    if (
      !best ||
      table.rows.length > best.rows.length ||
      (table.rows.length === best.rows.length &&
        Object.keys(table.columns).length > Object.keys(best.columns).length)
    ) {
      best = table;
    }
  }
  return best;
}

/** 送给 AI 的列：只带有内容的字段，减少提示词体积。 */
export function buildCatalogAIInput(
  table: CourseCatalogTable,
  fileName: string,
  options: { maxRows?: number; maxCellLength?: number } = {},
) {
  const maxRows = options.maxRows ?? 200;
  const maxCellLength = options.maxCellLength ?? 60;
  // 学期不参与识别：分类只需要课程名，避免把「各」「1-6」这类排课信息带进提示词。
  const fields: Array<keyof CourseCatalogColumns> = [
    "name",
    "courseNo",
    "credits",
    "hours",
    "category",
    "nature",
  ];
  const used = fields.filter((field) => table.columns[field] !== undefined);
  const labels = used.map((field) => HEADER_LABELS[field]);
  const rows = table.rows.slice(0, maxRows).map((row) => ({
    rowNumber: row.rowNumber,
    cells: used.map((field) => row[field].slice(0, maxCellLength)),
  }));
  return {
    fileName,
    sheetName: table.sheetName,
    headerLabels: labels,
    rows,
  };
}

const HEADER_LABELS: Record<keyof CourseCatalogColumns, string> = {
  name: "课程名称",
  courseNo: "课程号",
  credits: "学分",
  hours: "总学时",
  term: "开课学期",
  category: "课程类别",
  nature: "课程性质",
};

/** 名称列的全部取值，用于校验 AI 是否照抄了表格里真实存在的课程名。 */
export function catalogNamePool(sheet: ParsedSpreadsheetSheet): Set<string> {
  const header = detectHeader(sheet);
  if (!header) {
    const all = new Set<string>();
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        const value = cleanCellText(cell.value);
        if (value) all.add(courseNameKey(value));
      }
    }
    return all;
  }
  const pool = new Set<string>();
  for (const row of sheet.rows) {
    if (row.rowNumber <= header.rowNumber) continue;
    for (const cell of row.cells) {
      if (cell.columnIndex !== header.columns.name) continue;
      const value = cleanCourseName(cell.value);
      if (value && value.length <= NAME_COLUMN_MAX_SCAN)
        pool.add(courseNameKey(value));
    }
  }
  return pool;
}

export interface MergeCatalogOptions {
  namePool: Set<string>;
  existingKeys?: ReadonlySet<string>;
}

export interface CatalogCandidate extends Omit<CourseCatalogRow, "rowNumber"> {
  rowNumber: number | null;
  exists: boolean;
}

export interface MergedCatalog {
  candidates: CatalogCandidate[];
  unverifiedCount: number;
  /** AI 返回的课程号与表格原值不一致、已回落到表格值的次数。 */
  courseNoRejectedCount: number;
  duplicateCount: number;
}

function catalogRowKey(
  row: Pick<CourseCatalogRow, "name" | "courseNo">,
): string {
  return `${courseNameKey(row.name)}|${normalizeCourseNo(row.courseNo)}`;
}

/**
 * 合并 AI 结果与规则结果：AI 给出的课程名必须能在表格名称列里找到原文，
 * 否则视为幻觉丢弃；课程号只信任表格原值，元数据缺失时回落到规则结果。
 */
export function mergeCatalogWithAI(
  table: CourseCatalogTable,
  aiCourses: readonly CourseCatalogAICourse[],
  options: MergeCatalogOptions,
): MergedCatalog {
  const ruleByKey = new Map(
    table.rows.map((row) => [catalogRowKey(row), row] as const),
  );
  // 只有名称在表格中唯一时，才允许按名称回退（AI 可能不返回课程号）。
  const ruleByName = new Map<string, CourseCatalogRow | null>();
  for (const row of table.rows) {
    const key = courseNameKey(row.name);
    ruleByName.set(key, ruleByName.has(key) ? null : row);
  }
  const existingKeys = options.existingKeys ?? new Set<string>();
  const seen = new Set<string>();
  const candidates: CatalogCandidate[] = [];
  let unverifiedCount = 0;
  let courseNoRejectedCount = 0;
  let duplicateCount = table.duplicateCount;

  for (const course of aiCourses) {
    const name = cleanCourseName(course.name);
    if (!name || name.length > 100) continue;
    const nameKey = courseNameKey(name);
    if (!options.namePool.has(nameKey)) {
      unverifiedCount += 1;
      continue;
    }
    const aiCourseNo = normalizeCourseNo(course.courseNo ?? "");
    let rule = ruleByKey.get(`${nameKey}|${aiCourseNo}`);
    if (!rule) {
      const nameMatch = ruleByName.get(nameKey);
      if (nameMatch) {
        rule = nameMatch;
      } else if (aiCourseNo) {
        // 同名多行且课程号对不上，无法定位到具体行，按未验证丢弃。
        unverifiedCount += 1;
        continue;
      }
    }
    // 定位到规则行后以规则行为键，避免 AI 省略课程号时同一行被补齐循环重复加入。
    const key = rule ? catalogRowKey(rule) : `${nameKey}|${aiCourseNo}`;
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);

    const ruleCourseNo = rule?.courseNo ? normalizeCourseNo(rule.courseNo) : "";
    let courseNo = rule?.courseNo || course.courseNo || "";
    if (aiCourseNo && ruleCourseNo && aiCourseNo !== ruleCourseNo) {
      courseNoRejectedCount += 1;
      courseNo = ruleCourseNo;
    } else if (aiCourseNo && !ruleCourseNo) {
      courseNo = course.courseNo ?? "";
    }

    candidates.push({
      rowNumber: rule?.rowNumber ?? null,
      name: rule?.name ?? name,
      courseNo,
      credits: course.credits || rule?.credits || "",
      hours: course.hours || rule?.hours || "",
      term: course.term || rule?.term || "",
      category: course.category || rule?.category || "",
      nature: course.nature || rule?.nature || "",
      exists: existingKeys.has(nameKey),
    });
  }

  // AI 可能只返回部分行；补齐规则识别到但 AI 未覆盖的行，避免静默丢课。
  for (const row of table.rows) {
    const key = catalogRowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      ...row,
      exists: existingKeys.has(courseNameKey(row.name)),
    });
  }

  return {
    candidates,
    unverifiedCount,
    courseNoRejectedCount,
    duplicateCount,
  };
}

/** 规则结果直接生成候选，并标注与已有分类的重复。 */
export function ruleCatalogCandidates(
  table: CourseCatalogTable,
  existingKeys: ReadonlySet<string> = new Set(),
): CatalogCandidate[] {
  return table.rows.map((row) => ({
    ...row,
    exists: existingKeys.has(courseNameKey(row.name)),
  }));
}
