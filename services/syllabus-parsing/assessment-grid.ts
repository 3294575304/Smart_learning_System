/**
 * Deterministic reader for "course objective × assessment method" grids.
 *
 * Real syllabi carry this table in at least three shapes:
 *  1. a percentage matrix whose columns total 100 (e.g. Python 2024 syllabus);
 *  2. a score decomposition whose last column is the objective total and whose
 *     assessment columns total the assessment weight (2018 engineering syllabi);
 *  3. a score table whose column headers already carry the weight in the label,
 *     e.g. "实验(20.0%)".
 *
 * Word tables lose merged cells when flattened into tab separated text, so the
 * reader never trusts column positions from the header row. It takes the column
 * names in order and reads numeric columns from the right, which stays correct
 * for every shape above.
 */

export interface AssessmentGridColumn {
  name: string;
  total: number;
}

export interface AssessmentGridRow {
  objectiveIndex: number;
  label: string;
  values: Array<number | null>;
}

export interface AssessmentGrid {
  columns: AssessmentGridColumn[];
  rows: AssessmentGridRow[];
}

export interface AssessmentMappingValue {
  objectiveCode: string;
  assessmentCode: string;
  allocationRate: number;
}

export interface AssessmentGridMappingResult {
  mappings: AssessmentMappingValue[];
  matchedColumns: number;
  unmatchedColumns: string[];
  warnings: string[];
}

const TOTAL_ROW = /^(合计|总计|小计)$/u;

const HEADER_NOISE =
  /^(序号|课程目标|课程目标内容|课程目标序号|毕业要求指标点|指标点|支撑毕业要求指标点|评价依据.*|考核与评价.*|考核方式|评分方式.*|成绩比例.*|设定总分值.*|合计|备注|比例.*|权重.*)$/u;

const COLUMN_WEIGHT_SUFFIX = /[（(]?\s*\d+(?:\.\d+)?\s*%\s*[)）]?$/u;

function normalizeCell(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}

function parseNumeric(value: string): number | null {
  const text = normalizeCell(value).replace(/%$/u, "");
  if (!/^\d+(?:\.\d+)?$/u.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function isHeaderNoise(value: string): boolean {
  const text = normalizeCell(value);
  return text.length === 0 || HEADER_NOISE.test(text);
}

function cleanColumnName(value: string): string {
  return normalizeCell(value).replace(COLUMN_WEIGHT_SUFFIX, "").trim();
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Splits one tab separated table line; returns null for ordinary paragraphs. */
function splitTableLine(line: string): string[] | null {
  const normalized = line.replace(/\u3000/gu, "\t");
  if (!normalized.includes("\t")) return null;
  return normalized.split("\t").map((cell) => cell.trim());
}

/**
 * Word extraction turns in-cell line breaks into real newlines, which splits one
 * table row into several text lines (e.g. "期中" / "考试"). A row that ends
 * without a tab therefore continues in the next line; re-join those fragments
 * before looking for table blocks.
 */
export function joinSoftBreaks(text: string): string {
  const lines = text.split(/\r?\n/u);
  const merged: string[] = [];
  let pending: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const isTable = line.includes("\t");
    if (pending !== null) {
      pending += line;
      if (line.endsWith("\t") || line.trim() === "") {
        merged.push(pending);
        pending = null;
      }
      continue;
    }
    const next = lines[index + 1];
    if (
      isTable &&
      !line.endsWith("\t") &&
      next !== undefined &&
      next.trim() !== ""
    ) {
      pending = line;
      continue;
    }
    merged.push(line);
  }
  if (pending !== null) merged.push(pending);
  return merged.join("\n");
}

/** Groups consecutive tab separated lines into table blocks. */
export function textTableBlocks(text: string): string[][][] {
  const blocks: string[][][] = [];
  let current: string[][] = [];
  for (const line of joinSoftBreaks(text).split(/\r?\n/u)) {
    const cells = splitTableLine(line);
    if (cells) {
      current.push(cells);
      continue;
    }
    if (current.length >= 3) blocks.push(current);
    current = [];
  }
  if (current.length >= 3) blocks.push(current);
  return blocks;
}

function objectiveIndexFromRow(row: readonly string[]): number | null {
  for (let index = 0; index < Math.min(row.length, 2); index += 1) {
    const text = normalizeCell(row[index] ?? "");
    const match = text.match(/^(?:课程目标|教学目标|目标|OBJ[-－]?)?(\d+)$/iu);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 100) {
        return parsed - 1;
      }
    }
  }
  return null;
}

/** Length of the trailing run of numeric or empty cells. */
function numericTailLength(row: readonly string[]): number {
  const trimmed = [...row];
  while (trimmed.length > 0 && !normalizeCell(trimmed[trimmed.length - 1]!)) {
    trimmed.pop();
  }
  let count = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const cell = trimmed[index]!;
    if (!normalizeCell(cell)) {
      count += 1;
      continue;
    }
    if (parseNumeric(cell) === null) break;
    count += 1;
  }
  return count;
}

function tailValues(
  row: readonly string[],
  width: number,
): Array<number | null> | null {
  const trimmed = [...row];
  while (trimmed.length > 0 && !normalizeCell(trimmed[trimmed.length - 1]!)) {
    trimmed.pop();
  }
  if (trimmed.length < width) return null;
  const values = trimmed.slice(trimmed.length - width).map(parseNumeric);
  if (values.every((value) => value === null)) return null;
  return values;
}

function extractColumnNames(
  headerRows: ReadonlyArray<readonly string[]>,
): string[] {
  for (let index = headerRows.length - 1; index >= 0; index -= 1) {
    const names = headerRows[index]!.map(cleanColumnName).filter(
      (value) => !isHeaderNoise(value),
    );
    if (names.length >= 1) return names;
  }
  return [];
}

/** Reads one table block; returns null when it is not an objective grid. */
export function buildAssessmentGrid(
  block: ReadonlyArray<readonly string[]>,
): AssessmentGrid | null {
  const headerIndex = block.findIndex((row) => {
    const joined = row.map(normalizeCell).join("");
    return (
      joined.includes("课程目标") &&
      !TOTAL_ROW.test(normalizeCell(row[0] ?? ""))
    );
  });
  if (headerIndex < 0) return null;

  let dataStart = -1;
  for (let index = headerIndex + 1; index < block.length; index += 1) {
    const row = block[index]!;
    const numeric = row.filter((cell) => parseNumeric(cell) !== null).length;
    if (numeric >= 2 && objectiveIndexFromRow(row) !== null) {
      dataStart = index;
      break;
    }
  }
  if (dataStart < 0) return null;

  const names = extractColumnNames(block.slice(headerIndex, dataStart));
  if (names.length === 0) return null;

  const dataRows: Array<{ row: readonly string[]; objectiveIndex: number }> =
    [];
  let totalRow: readonly string[] | null = null;
  for (let index = dataStart; index < block.length; index += 1) {
    const row = block[index]!;
    if (TOTAL_ROW.test(normalizeCell(row[0] ?? ""))) {
      totalRow = row;
      continue;
    }
    const objectiveIndex = objectiveIndexFromRow(row);
    if (objectiveIndex === null) continue;
    dataRows.push({ row, objectiveIndex });
  }
  if (dataRows.length === 0) return null;

  const maxTail = Math.max(
    ...dataRows.map(({ row }) => numericTailLength(row)),
  );

  // Column names are the anchor: a syllabus cell such as the graduation
  // indicator "2.1" also looks numeric, so the tail run may be longer than the
  // real grid. Try the shapes with and without a trailing objective total and
  // keep the first one that reconciles row sums.
  const shapes = [names.length + 1, names.length].filter(
    (width) => width > 0 && width <= maxTail,
  );
  let chosen: {
    width: number;
    usable: Array<{
      entry: (typeof dataRows)[number];
      values: Array<number | null>;
    }>;
  } | null = null;

  for (const width of shapes) {
    const usable = dataRows.flatMap((entry) => {
      const values = tailValues(entry.row, width);
      return values ? [{ entry, values }] : [];
    });
    if (usable.length * 2 < dataRows.length) continue;
    const hasTotalColumn = width === names.length + 1;
    if (hasTotalColumn) {
      const reconciled = usable.filter(({ values }) => {
        const objectiveTotal = values[values.length - 1];
        if (objectiveTotal === null) return false;
        const sum = values
          .slice(0, values.length - 1)
          .reduce<number>((total, value) => total + (value ?? 0), 0);
        return Math.abs(sum - objectiveTotal) <= 0.5;
      });
      if (reconciled.length * 2 < usable.length) continue;
    }
    chosen = { width, usable };
    break;
  }
  if (!chosen) return null;

  const { usable, width } = chosen;
  const totalValues = totalRow ? tailValues(totalRow, width) : null;

  const columns: AssessmentGridColumn[] = names.map((name, columnIndex) => {
    const footer = totalValues?.[columnIndex] ?? null;
    const total =
      footer ??
      usable.reduce<number>(
        (sum, { values }) => sum + (values[columnIndex] ?? 0),
        0,
      );
    return { name, total };
  });
  if (columns.some((column) => !(column.total > 0))) return null;

  return {
    columns,
    rows: usable.map(({ entry, values }) => ({
      objectiveIndex: entry.objectiveIndex,
      label: normalizeCell(entry.row[0] ?? ""),
      values: values.slice(0, names.length),
    })),
  };
}

export interface LocatedAssessmentGrid {
  grid: AssessmentGrid;
  page: number;
}

/** Reads every objective grid found in extracted page text. */
export function findAssessmentGrids(
  pages: ReadonlyArray<{ pageNumber: number; text: string }>,
): LocatedAssessmentGrid[] {
  const located: LocatedAssessmentGrid[] = [];
  for (const page of pages) {
    for (const block of textTableBlocks(page.text)) {
      const grid = buildAssessmentGrid(block);
      if (grid) located.push({ grid, page: page.pageNumber });
    }
  }
  return located;
}

function containsName(left: string, right: string): boolean {
  return (
    left.length >= 2 &&
    right.length >= 2 &&
    (left.includes(right) || right.includes(left))
  );
}

function matchColumnByWeight(
  total: number,
  candidates: ReadonlyArray<{ code: string; weight: number | null }>,
): string[] | null {
  const tolerance = Math.max(0.5, total * 0.01);
  const exact = candidates.filter(
    (item) =>
      item.weight !== null && Math.abs(item.weight - total) <= tolerance,
  );
  if (exact.length === 1) return [exact[0]!.code];
  if (exact.length > 1) return rareMatch(exact, total);

  const usable = candidates.filter(
    (item) =>
      item.weight !== null &&
      item.weight > 0 &&
      item.weight <= total + tolerance,
  );
  if (usable.length > 8) return null;
  for (let first = 0; first < usable.length; first += 1) {
    for (let second = first + 1; second < usable.length; second += 1) {
      const sum = usable[first]!.weight! + usable[second]!.weight!;
      if (Math.abs(sum - total) <= tolerance) {
        return [usable[first]!.code, usable[second]!.code];
      }
      for (let third = second + 1; third < usable.length; third += 1) {
        const triple = sum + usable[third]!.weight!;
        if (Math.abs(triple - total) <= tolerance) {
          return [
            usable[first]!.code,
            usable[second]!.code,
            usable[third]!.code,
          ];
        }
      }
    }
  }
  return null;
}

function rareMatch(
  candidates: ReadonlyArray<{ code: string; weight: number | null }>,
  total: number,
): string[] | null {
  const sorted = [...candidates].sort(
    (left, right) =>
      Math.abs((left.weight ?? 0) - total) -
      Math.abs((right.weight ?? 0) - total),
  );
  return sorted[0] ? [sorted[0].code] : null;
}

/** Reads the ordinal numbering a syllabus uses for its course objectives. */
function objectiveOrdinal(text: string): number | null {
  const match = normalizeCell(text).match(
    /(?:课程目标|教学目标|目标|OBJ)[-－_\s]?(\d{1,2})/iu,
  );
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100
    ? parsed
    : null;
}

interface GridRowAlignment {
  /** Objective index per grid row; null when the row has no reliable target. */
  indices: Array<number | null>;
  unresolvedLabels: string[];
}

/**
 * Aligns grid rows with parsed objectives by ordinal rather than array position.
 * A model may keep an extra objective (for example a 思政 goal) that the score
 * table never lists, and positional matching would then shift every row after it.
 */
function alignGridRows(
  grid: AssessmentGrid,
  objectives: ReadonlyArray<{ code: string; title?: string | null }>,
): GridRowAlignment {
  const byOrdinal = new Map<number, number>();
  // The ordinal in the title ("课程目标2") is source wording and wins; the
  // OBJ-N code is generated, so it may only fill a number nobody else claimed.
  objectives.forEach((objective, index) => {
    const ordinal = objectiveOrdinal(objective.title ?? "");
    if (ordinal !== null && !byOrdinal.has(ordinal)) {
      byOrdinal.set(ordinal, index);
    }
  });
  objectives.forEach((objective, index) => {
    if (objectiveOrdinal(objective.title ?? "") !== null) return;
    const ordinal = objectiveOrdinal(objective.code);
    if (ordinal !== null && !byOrdinal.has(ordinal)) {
      byOrdinal.set(ordinal, index);
    }
  });

  const positional = grid.rows.length === objectives.length;
  const used = new Set<number>();
  const indices = grid.rows.map((row, rowIndex) => {
    const ordinal = byOrdinal.get(row.objectiveIndex + 1);
    if (ordinal !== undefined && !used.has(ordinal)) {
      used.add(ordinal);
      return ordinal;
    }
    if (positional && !used.has(rowIndex)) {
      used.add(rowIndex);
      return rowIndex;
    }
    return null;
  });

  return {
    indices,
    unresolvedLabels: grid.rows
      .filter((_, rowIndex) => indices[rowIndex] === null)
      .map((row) => row.label),
  };
}

/**
 * Maps grid columns onto parsed assessments and converts every cell into the
 * allocation rate that the assessment scheme expects (column-relative share).
 */
export function mapGridToAssessments(
  grid: AssessmentGrid,
  objectives: ReadonlyArray<{ code: string; title?: string | null }>,
  assessments: ReadonlyArray<{
    code: string;
    name: string;
    weight: number | null;
  }>,
  page: number,
): AssessmentGridMappingResult {
  const warnings: string[] = [];
  const assigned = new Map<number, string[]>();
  const used = new Set<string>();
  const normalizedAssessments = assessments.map((item) => ({
    ...item,
    normalized: normalizeCell(item.name).replace(COLUMN_WEIGHT_SUFFIX, ""),
  }));

  const claim = (columnIndex: number, codes: string[]) => {
    assigned.set(columnIndex, codes);
    codes.forEach((code) => used.add(code));
  };

  grid.columns.forEach((column, columnIndex) => {
    const target = normalizeCell(column.name).replace(COLUMN_WEIGHT_SUFFIX, "");
    if (!target) return;
    const exact = normalizedAssessments.find(
      (item) => !used.has(item.code) && item.normalized === target,
    );
    if (exact) {
      claim(columnIndex, [exact.code]);
      return;
    }
    const partial = normalizedAssessments.filter(
      (item) =>
        !used.has(item.code) &&
        (containsName(item.normalized, target) ||
          containsName(target, item.normalized)),
    );
    if (partial.length === 1) claim(columnIndex, [partial[0]!.code]);
  });

  grid.columns.forEach((column, columnIndex) => {
    if (assigned.has(columnIndex)) return;
    const available = normalizedAssessments.filter(
      (item) => !used.has(item.code),
    );
    const matched = matchColumnByWeight(column.total, available);
    if (matched) claim(columnIndex, matched);
  });

  const unmatchedColumns = grid.columns
    .filter((_, columnIndex) => !assigned.has(columnIndex))
    .map((column) => column.name);

  // Per assessment the rates must cover every objective and total exactly 100,
  // which is what the publishable structure validates.
  const alignment = alignGridRows(grid, objectives);
  const perAssessment = new Map<string, Map<number, number>>();
  grid.columns.forEach((column, columnIndex) => {
    const codes = assigned.get(columnIndex);
    if (!codes || codes.length === 0) return;
    const rates = new Map<number, number>();
    grid.rows.forEach((row, rowIndex) => {
      const target = alignment.indices[rowIndex];
      if (target === null || target === undefined) return;
      const value = row.values[columnIndex];
      if (value === null || value === undefined) return;
      rates.set(target, roundRate((value / column.total) * 100));
    });
    if (rates.size === 0) return;
    for (const code of codes) perAssessment.set(code, rates);
  });

  const mappings: AssessmentMappingValue[] = [];
  const incompleteObjectives = new Set<string>();
  perAssessment.forEach((rates, assessmentCode) => {
    const indices = objectives.map((_, index) => index);
    const missing = indices.filter((index) => !rates.has(index));
    if (missing.length > 0) {
      missing.forEach((index) => {
        rates.set(index, 0);
        const objective = objectives[index];
        if (objective) incompleteObjectives.add(objective.code);
      });
    }
    const ordered = indices.filter((index) => objectives[index]);
    if (ordered.length === 0) return;
    const total = ordered.reduce(
      (sum, index) => sum + (rates.get(index) ?? 0),
      0,
    );
    if (Math.abs(total - 100) <= 0.1) {
      const lastIndex = ordered[ordered.length - 1]!;
      rates.set(
        lastIndex,
        roundRate((rates.get(lastIndex) ?? 0) + (100 - total)),
      );
    }
    ordered.forEach((index) => {
      const objective = objectives[index]!;
      const rate = rates.get(index) ?? 0;
      mappings.push({
        objectiveCode: objective.code,
        assessmentCode,
        allocationRate: Math.min(100, Math.max(0, rate)),
      });
    });
  });

  if (alignment.unresolvedLabels.length > 0) {
    warnings.push(
      `原表课程目标行「${alignment.unresolvedLabels.join("、")}」未能对应到已识别课程目标，已跳过该行分值，请核对。`,
    );
  }
  if (unmatchedColumns.length > 0) {
    warnings.push(
      `原表考核列「${unmatchedColumns.join("、")}」未能对应到已识别考核方式，请核对考核方式名称。`,
    );
  }
  if (incompleteObjectives.size > 0) {
    warnings.push(
      `原表未给出课程目标「${[...incompleteObjectives].join("、")}」在这些考核方式中的分值，已按 0 处理，请核对。`,
    );
  }
  return {
    mappings,
    matchedColumns: grid.columns.length - unmatchedColumns.length,
    unmatchedColumns,
    warnings: [
      ...warnings,
      `已从教学大纲原文第 ${page} 页考核表按列合计换算课程目标占比。`,
    ],
  };
}

/**
 * Even draft used when the syllabus only carries assessment weights and no
 * objective breakdown. The result always totals 100 per assessment and is
 * always reported as a draft that the teacher must confirm.
 */
export function buildDraftMappings(
  objectives: ReadonlyArray<{ code: string }>,
  assessments: ReadonlyArray<{ code: string }>,
): AssessmentGridMappingResult {
  if (objectives.length === 0 || assessments.length === 0) {
    return {
      mappings: [],
      matchedColumns: 0,
      unmatchedColumns: [],
      warnings: [],
    };
  }
  const count = objectives.length;
  const base = Math.floor((100 / count) * 100) / 100;
  const rates = Array.from({ length: count }, (_, index) =>
    index === count - 1 ? roundRate(100 - base * (count - 1)) : base,
  );
  const mappings = assessments.flatMap((assessment) =>
    objectives.map((objective, index) => ({
      objectiveCode: objective.code,
      assessmentCode: assessment.code,
      allocationRate: rates[index]!,
    })),
  );
  return {
    mappings,
    matchedColumns: 0,
    unmatchedColumns: [],
    warnings: [
      `教学大纲原文未给出课程目标在各考核方式中的分解，系统已按每个考核方式下 ${count} 个课程目标等分生成草稿（各 ${rates[0]}% 左右），请教师对照大纲核对后再发布。`,
    ],
  };
}
