import { unzipSync } from "fflate";

export interface ForwardAssessmentItem {
  code: string;
  name: string;
  group: string;
  points: number;
  objectivePoints: number[];
  sourceColumn: number;
}

export interface ForwardAssessmentTable {
  method: "FORWARD_DECOMPOSITION";
  sourceRefs: Array<{ page: number; verified: boolean }>;
  tableNumber: number;
  items: ForwardAssessmentItem[];
  objectiveTotals: number[];
  totalPoints: number;
  warnings: string[];
}

function xmlText(value: string): string {
  return [...value.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
    .map((match) =>
      match[1]!
        .replace(/&amp;/gu, "&")
        .replace(/&lt;/gu, "<")
        .replace(/&gt;/gu, ">")
        .replace(/&quot;/gu, '"')
        .replace(/&apos;/gu, "'"),
    )
    .join("")
    .trim();
}

function rowsOf(table: string): string[][] {
  return [...table.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/gu)].map(
    ([row]) =>
      [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/gu)].flatMap(
        ([cell]) => {
          const span = Number(
            cell.match(/<w:gridSpan\s+w:val="(\d+)"\s*\/?/u)?.[1] ?? 1,
          );
          return Array.from({ length: span }, (_, index) =>
            index === 0 ? xmlText(cell) : "",
          );
        },
      ),
  );
}

function numeric(value: string): number | null {
  if (!/^\d+(?:\.\d+)?$/u.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function header(row: string[], column: number): string {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    if (index === column && row[index]) return row[index];
  }
  return "";
}

function docxXml(data: Buffer): string | null {
  if (!data.subarray(0, 2).equals(Buffer.from("PK"))) return null;
  try {
    const document = unzipSync(new Uint8Array(data), {
      filter: (entry) =>
        entry.name === "word/document.xml" &&
        entry.originalSize <= 32 * 1024 * 1024,
    })["word/document.xml"];
    if (!document || document.length > 32 * 1024 * 1024) return null;
    return new TextDecoder().decode(document);
  } catch {
    return null;
  }
}

/**
 * Reads every Word table as a cell matrix. Merged cells are expanded by their
 * grid span so downstream readers can work on a uniform row shape.
 */
export function readDocxTableRows(data: Buffer): string[][][] {
  const xml = docxXml(data);
  if (!xml) return [];
  return [...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/gu)].map(
    ([table]) => rowsOf(table),
  );
}

/** Reads the numeric grid, including empty cells, from a Word assessment table. */
export function extractForwardAssessmentTable(
  data: Buffer,
): ForwardAssessmentTable | null {
  const xml = docxXml(data);
  if (!xml) return null;
  const tables = [
    ...xml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/gu),
  ].map(([value]) => value);
  const tableIndex = tables.findIndex(
    (value) =>
      /课程目标序号/u.test(xmlText(value)) &&
      /成绩比例/u.test(xmlText(value)) &&
      /合计/u.test(xmlText(value)),
  );
  if (tableIndex < 0) return null;
  const rows = rowsOf(tables[tableIndex]!);
  const totalRow = rows.findIndex((row) => row[0] === "合计");
  const objectiveRows = rows.filter((row) => /^\d+$/u.test(row[0] ?? ""));
  if (totalRow < 0 || objectiveRows.length === 0) return null;
  const totals = rows[totalRow]!;
  const lastColumn = totals.length - 1;
  if (lastColumn <= 4 || numeric(totals[lastColumn] ?? "") !== 100) return null;
  const firstColumn = 3;
  const items: ForwardAssessmentItem[] = [];
  const warnings: string[] = [];
  for (let column = firstColumn; column < lastColumn; column += 1) {
    const footerPoints = numeric(totals[column] ?? "");
    if (footerPoints === null || footerPoints <= 0) return null;
    const objectivePoints = objectiveRows.map((row) => {
      const cell = row[column] ?? "";
      return cell === "" ? 0 : numeric(cell);
    });
    if (objectivePoints.some((value) => value === null)) return null;
    const sum = objectivePoints.reduce<number>(
      (value, part) => value + (part ?? 0),
      0,
    );
    if (sum <= 0) return null;
    if (Math.abs(sum - footerPoints) > 0.000001) {
      warnings.push(
        `原表第 ${column - firstColumn + 1} 个计分项的合计行写为 ${footerPoints} 分，各目标行实际合计 ${sum} 分；请对照原文确认。`,
      );
    }
    const leaf = rows
      .slice(0, 4)
      .map((row) => header(row, column))
      .filter(Boolean)
      .at(-1);
    if (!leaf) return null;
    const headingPoints = Number(leaf.match(/(\d+(?:\.\d+)?)%\s*$/u)?.[1]);
    if (
      Number.isFinite(headingPoints) &&
      Math.abs(headingPoints - sum) > 0.000001
    ) {
      warnings.push(
        `原表第 ${column - firstColumn + 1} 个计分项表头写为 ${headingPoints} 分，各目标行实际合计 ${sum} 分；请对照原文确认。`,
      );
    }
    const group =
      rows[2]
        ?.slice(0, column + 1)
        .reverse()
        .find(Boolean) ?? leaf;
    items.push({
      code: `ASSESS-LEAF-${items.length + 1}`,
      name: leaf.replace(/\s*\d+(?:\.\d+)?%\s*$/u, ""),
      group: group.replace(/\s*\d+(?:\.\d+)?%\s*$/u, ""),
      points: sum,
      objectivePoints: objectivePoints as number[],
      sourceColumn: column + 1,
    });
  }
  const objectiveTotals = objectiveRows.map((row) =>
    numeric(row[lastColumn] ?? ""),
  );
  if (objectiveTotals.some((value) => value === null)) return null;
  for (let index = 0; index < objectiveRows.length; index += 1) {
    const sum = items.reduce(
      (value, item) => value + item.objectivePoints[index]!,
      0,
    );
    if (Math.abs(sum - objectiveTotals[index]!) > 0.000001) return null;
  }
  const totalPoints = items.reduce((value, item) => value + item.points, 0);
  if (Math.abs(totalPoints - 100) > 0.000001) return null;
  return {
    method: "FORWARD_DECOMPOSITION",
    sourceRefs: [{ page: 1, verified: false }],
    tableNumber: tableIndex + 1,
    items,
    objectiveTotals: objectiveTotals as number[],
    totalPoints,
    warnings,
  };
}
