import { TextDecoder } from "node:util";
import { inflateRawSync } from "node:zlib";

import type { StudentRosterExtension } from "@/services/course-files/config";
import { StudentImportOperationError } from "@/services/student-imports/errors";

const XLSX_MAX_XML_ENTRY_BYTES = 10 * 1024 * 1024;
const XLS_OLE_HEADER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
const ZIP_LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const OLE_FREESECT = -1;
const OLE_ENDOFCHAIN = -2;

interface ZipEntry {
  name: string;
  flags: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

interface OleDirectoryEntry {
  name: string;
  type: number;
  startingSector: number;
  streamSize: number;
}

interface BiffRecord {
  type: number;
  payload: Buffer;
  startOffset: number;
  endOffset: number;
}

interface XlsSheetMeta {
  name: string;
  startOffset: number;
  hidden: boolean;
  sheetType: number;
}

export interface ParsedSpreadsheetCell {
  rowNumber: number;
  columnIndex: number;
  columnName: string;
  value: string;
  rawValue: string;
  type: "blank" | "boolean" | "error" | "number" | "string";
  hasFormula: boolean;
}

export interface ParsedSpreadsheetRow {
  rowNumber: number;
  cells: ParsedSpreadsheetCell[];
}

export interface ParsedSpreadsheetMergedRange {
  ref: string;
  startRow: number;
  endRow: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

export interface ParsedSpreadsheetSheet {
  name: string;
  index: number;
  hidden: boolean;
  rows: ParsedSpreadsheetRow[];
  mergedRanges: ParsedSpreadsheetMergedRange[];
}

export interface ParsedSpreadsheetWorkbook {
  format: StudentRosterExtension;
  sheets: ParsedSpreadsheetSheet[];
}

function startsWith(data: Buffer, header: Buffer): boolean {
  return (
    data.length >= header.length &&
    data.subarray(0, header.length).equals(header)
  );
}

export function columnNameFromIndex(columnIndex: number): string {
  let value = columnIndex + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function columnIndexFromName(name: string): number {
  let value = 0;
  for (const char of name.toUpperCase()) {
    if (char < "A" || char > "Z") break;
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, value - 1);
}

function parseCellReference(ref: string): {
  rowNumber: number | null;
  columnIndex: number | null;
} {
  const match = /^([A-Z]+)(\d+)$/iu.exec(ref);
  if (!match) {
    return { rowNumber: null, columnIndex: null };
  }

  return {
    rowNumber: Number(match[2]),
    columnIndex: columnIndexFromName(match[1] ?? ""),
  };
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/giu,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal) return String.fromCodePoint(Number(decimal));
      if (hexadecimal) return String.fromCodePoint(parseInt(hexadecimal, 16));
      switch (entity) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        case "&apos;":
          return "'";
        default:
          return entity;
      }
    },
  );
}

function parseXmlAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag)) !== null) {
    const [, key, doubleQuoted, singleQuoted] = match;
    if (!key) continue;
    attributes[key] = decodeXmlEntities(doubleQuoted ?? singleQuoted ?? "");
  }
  return attributes;
}

function extractXmlText(content: string, tagName: string): string | null {
  const qualifiedTag = `(?:[A-Za-z_][\\w.-]*:)?${tagName}`;
  const pattern = new RegExp(
    `<${qualifiedTag}\\b[^>]*>([\\s\\S]*?)</${qualifiedTag}>`,
    "u",
  );
  const match = pattern.exec(content);
  return match ? decodeXmlEntities(match[1] ?? "") : null;
}

function extractAllXmlTexts(content: string, tagName: string): string[] {
  const qualifiedTag = `(?:[A-Za-z_][\\w.-]*:)?${tagName}`;
  const pattern = new RegExp(
    `<${qualifiedTag}\\b[^>]*>([\\s\\S]*?)</${qualifiedTag}>`,
    "gu",
  );
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    values.push(decodeXmlEntities(match[1] ?? ""));
  }
  return values;
}

function decodeUtf8(data: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new StudentImportOperationError("CSV 文件必须使用 UTF-8 编码。", 400);
  }
}

function csvCell(
  rowNumber: number,
  columnIndex: number,
  value: string,
): ParsedSpreadsheetCell {
  return {
    rowNumber,
    columnIndex,
    columnName: columnNameFromIndex(columnIndex),
    value,
    rawValue: value,
    type: value === "" ? "blank" : "string",
    hasFormula: false,
  };
}

function parseCsvWorkbook(data: Buffer): ParsedSpreadsheetWorkbook {
  if (data.includes(0)) {
    throw new StudentImportOperationError("CSV 文件不能包含二进制内容。", 400);
  }

  const text = decodeUtf8(data).replace(/^\uFEFF/u, "");
  const rows: ParsedSpreadsheetRow[] = [];
  let currentField = "";
  let currentCells: string[] = [];
  let inQuotes = false;
  let atFieldStart = true;
  let rowNumber = 1;

  function finishField(): void {
    currentCells.push(currentField);
    currentField = "";
    atFieldStart = true;
  }

  function finishRow(): void {
    finishField();
    rows.push({
      rowNumber,
      cells: currentCells.map((value, index) =>
        csvCell(rowNumber, index, value),
      ),
    });
    currentCells = [];
    rowNumber += 1;
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          currentField += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      continue;
    }

    if (char === ",") {
      finishField();
      continue;
    }

    if (char === "\r" || char === "\n") {
      finishRow();
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    currentField += char;
    atFieldStart = false;
  }

  if (inQuotes) {
    throw new StudentImportOperationError("CSV 文件存在未闭合的引号。", 400);
  }

  const endedWithLineBreak = /(?:\r|\n)$/u.test(text);
  if (
    currentField !== "" ||
    currentCells.length > 0 ||
    (text.length > 0 && !endedWithLineBreak)
  ) {
    finishRow();
  }

  if (rows.length === 0) {
    throw new StudentImportOperationError("CSV 文件没有可解析的数据行。", 400);
  }

  return {
    format: "csv",
    sheets: [
      {
        name: "CSV",
        index: 0,
        hidden: false,
        rows,
        mergedRanges: [],
      },
    ],
  };
}

function findEndOfCentralDirectory(data: Buffer): number {
  const earliest = Math.max(0, data.length - 22 - 0xffff);
  for (let offset = data.length - 22; offset >= earliest; offset -= 1) {
    if (data.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new StudentImportOperationError(
    "XLSX 文件不是可解析的 ZIP 工作簿。",
    400,
  );
}

function parseZipEntries(data: Buffer): ZipEntry[] {
  if (!startsWith(data, Buffer.from("PK", "ascii"))) {
    throw new StudentImportOperationError("XLSX 文件内容不是合法工作簿。", 400);
  }

  const eocdOffset = findEndOfCentralDirectory(data);
  const diskNumber = data.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = data.readUInt16LE(eocdOffset + 6);
  const totalEntries = data.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = data.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = data.readUInt32LE(eocdOffset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0) {
    throw new StudentImportOperationError("不支持分卷 XLSX 文件。", 400);
  }

  if (
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new StudentImportOperationError("不支持 ZIP64 XLSX 文件。", 400);
  }

  if (centralDirectoryOffset + centralDirectorySize > data.length) {
    throw new StudentImportOperationError("XLSX 文件目录损坏。", 400);
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (
      offset + 46 > data.length ||
      data.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new StudentImportOperationError("XLSX 文件目录损坏。", 400);
    }

    const flags = data.readUInt16LE(offset + 8);
    const compressionMethod = data.readUInt16LE(offset + 10);
    const compressedSize = data.readUInt32LE(offset + 20);
    const uncompressedSize = data.readUInt32LE(offset + 24);
    const fileNameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    const localHeaderOffset = data.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > data.length) {
      throw new StudentImportOperationError("XLSX 文件目录损坏。", 400);
    }

    const name = data.subarray(nameStart, nameEnd).toString("utf8");
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..")
    ) {
      throw new StudentImportOperationError("XLSX 文件包含非法路径。", 400);
    }

    if ((flags & 0x1) === 0x1) {
      throw new StudentImportOperationError("不支持加密 XLSX 文件。", 400);
    }

    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new StudentImportOperationError(
        "XLSX 文件使用了不支持的压缩方式。",
        400,
      );
    }

    entries.push({
      name,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function extractZipEntry(data: Buffer, entry: ZipEntry): Buffer {
  if (
    entry.localHeaderOffset + 30 > data.length ||
    data.readUInt32LE(entry.localHeaderOffset) !== ZIP_LOCAL_HEADER_SIGNATURE
  ) {
    throw new StudentImportOperationError("XLSX 文件目录损坏。", 400);
  }

  if (entry.uncompressedSize > XLSX_MAX_XML_ENTRY_BYTES) {
    throw new StudentImportOperationError("XLSX 工作表内容过大。", 413);
  }

  const fileNameLength = data.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = data.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > data.length) {
    throw new StudentImportOperationError("XLSX 文件目录损坏。", 400);
  }

  const compressed = data.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return compressed;
  return inflateRawSync(compressed);
}

function zipEntryText(
  data: Buffer,
  entryByName: Map<string, ZipEntry>,
  name: string,
): string | null {
  const entry = entryByName.get(name);
  return entry ? extractZipEntry(data, entry).toString("utf8") : null;
}

function parseSharedStrings(sharedStringsXml: string | null): string[] {
  if (!sharedStringsXml) return [];

  const strings: string[] = [];
  const pattern =
    /<(?:[A-Za-z_][\w.-]*:)?si\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?si>/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sharedStringsXml)) !== null) {
    strings.push(extractAllXmlTexts(match[1] ?? "", "t").join(""));
  }
  return strings;
}

function resolveWorkbookTarget(target: string): string {
  const cleaned = target.replace(/\\/gu, "/");
  const withPrefix = cleaned.startsWith("/")
    ? cleaned.slice(1)
    : `xl/${cleaned.replace(/^xl\//u, "")}`;
  const parts: string[] = [];
  for (const part of withPrefix.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function parseWorkbookSheets(
  workbookXml: string,
  relationshipsXml: string | null,
): Array<{
  name: string;
  hidden: boolean;
  target: string;
}> {
  const relationshipTargets = new Map<string, string>();
  if (relationshipsXml) {
    const relationshipPattern =
      /<(?:[A-Za-z_][\w.-]*:)?Relationship\b([^>]*)\/?>/gu;
    let relationshipMatch: RegExpExecArray | null;
    while ((relationshipMatch = relationshipPattern.exec(relationshipsXml))) {
      const attributes = parseXmlAttributes(relationshipMatch[1] ?? "");
      const id = attributes.Id ?? attributes.id;
      const target = attributes.Target ?? attributes.target;
      if (id && target) {
        relationshipTargets.set(id, resolveWorkbookTarget(target));
      }
    }
  }

  const sheets: Array<{ name: string; hidden: boolean; target: string }> = [];
  const sheetPattern = /<(?:[A-Za-z_][\w.-]*:)?sheet\b([^>]*)\/?>/gu;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetPattern.exec(workbookXml)) !== null) {
    const attributes = parseXmlAttributes(sheetMatch[1] ?? "");
    const relationshipId = attributes["r:id"] ?? attributes.id;
    const target =
      relationshipId && relationshipTargets.get(relationshipId)
        ? relationshipTargets.get(relationshipId)
        : `xl/worksheets/sheet${sheets.length + 1}.xml`;
    if (!target) continue;

    sheets.push({
      name: attributes.name ?? `Sheet${sheets.length + 1}`,
      hidden:
        attributes.state === "hidden" || attributes.state === "veryHidden",
      target,
    });
  }

  return sheets;
}

function parseXlsxMergedRanges(xml: string): ParsedSpreadsheetMergedRange[] {
  const ranges: ParsedSpreadsheetMergedRange[] = [];
  const pattern = /<(?:[A-Za-z_][\w.-]*:)?mergeCell\b([^>]*)\/?>/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const ref = parseXmlAttributes(match[1] ?? "").ref;
    if (!ref) continue;
    const [startRef, endRef = startRef] = ref.split(":");
    const start = parseCellReference(startRef ?? "");
    const end = parseCellReference(endRef ?? "");
    if (
      start.rowNumber === null ||
      start.columnIndex === null ||
      end.rowNumber === null ||
      end.columnIndex === null
    ) {
      continue;
    }
    ranges.push({
      ref,
      startRow: Math.min(start.rowNumber, end.rowNumber),
      endRow: Math.max(start.rowNumber, end.rowNumber),
      startColumnIndex: Math.min(start.columnIndex, end.columnIndex),
      endColumnIndex: Math.max(start.columnIndex, end.columnIndex),
    });
  }
  return ranges;
}

function parseXlsxCellValue(
  attributes: Record<string, string>,
  body: string,
  sharedStrings: readonly string[],
): Pick<ParsedSpreadsheetCell, "rawValue" | "type" | "value"> {
  const raw = extractXmlText(body, "v") ?? "";
  const type = attributes.t;

  if (type === "s") {
    const index = Number(raw);
    const value = Number.isSafeInteger(index)
      ? (sharedStrings[index] ?? "")
      : "";
    return { value, rawValue: raw, type: value ? "string" : "blank" };
  }

  if (type === "inlineStr") {
    const value = extractAllXmlTexts(body, "t").join("");
    return { value, rawValue: value, type: value ? "string" : "blank" };
  }

  if (type === "str") {
    return { value: raw, rawValue: raw, type: raw ? "string" : "blank" };
  }

  if (type === "b") {
    const value = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : raw;
    return { value, rawValue: raw, type: "boolean" };
  }

  if (type === "e") {
    return { value: raw, rawValue: raw, type: "error" };
  }

  return { value: raw, rawValue: raw, type: raw ? "number" : "blank" };
}

function parseXlsxRows(
  xml: string,
  sharedStrings: readonly string[],
): ParsedSpreadsheetRow[] {
  const rows: ParsedSpreadsheetRow[] = [];
  const rowPattern =
    /<(?:[A-Za-z_][\w.-]*:)?row\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?row>|<(?:[A-Za-z_][\w.-]*:)?row\b([^>]*)\/>/gu;
  let fallbackRowNumber = 1;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml)) !== null) {
    const rowAttributes = parseXmlAttributes(rowMatch[1] ?? rowMatch[3] ?? "");
    const rowNumber = Number(rowAttributes.r) || fallbackRowNumber;
    fallbackRowNumber = rowNumber + 1;
    const rowBody = rowMatch[2] ?? "";
    const cells: ParsedSpreadsheetCell[] = [];
    const cellPattern =
      /<(?:[A-Za-z_][\w.-]*:)?c\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?c>|<(?:[A-Za-z_][\w.-]*:)?c\b([^>]*)\/>/gu;
    let fallbackColumnIndex = 0;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowBody)) !== null) {
      const attributes = parseXmlAttributes(cellMatch[1] ?? cellMatch[3] ?? "");
      const ref = attributes.r ? parseCellReference(attributes.r) : null;
      const columnIndex = ref?.columnIndex ?? fallbackColumnIndex;
      const body = cellMatch[2] ?? "";
      const value = parseXlsxCellValue(attributes, body, sharedStrings);
      cells.push({
        rowNumber,
        columnIndex,
        columnName: columnNameFromIndex(columnIndex),
        hasFormula: /<(?:[A-Za-z_][\w.-]*:)?f\b/iu.test(body),
        ...value,
      });
      fallbackColumnIndex = columnIndex + 1;
    }
    rows.push({
      rowNumber,
      cells: cells.sort((left, right) => left.columnIndex - right.columnIndex),
    });
  }
  return rows;
}

function parseXlsxWorkbook(data: Buffer): ParsedSpreadsheetWorkbook {
  const entries = parseZipEntries(data);
  const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
  const workbookXml = zipEntryText(data, entryByName, "xl/workbook.xml");
  if (!entryByName.has("[Content_Types].xml") || !workbookXml) {
    throw new StudentImportOperationError("XLSX 文件缺少必要工作簿结构。", 400);
  }

  const sharedStrings = parseSharedStrings(
    zipEntryText(data, entryByName, "xl/sharedStrings.xml"),
  );
  const sheets = parseWorkbookSheets(
    workbookXml,
    zipEntryText(data, entryByName, "xl/_rels/workbook.xml.rels"),
  );

  if (sheets.length === 0) {
    throw new StudentImportOperationError("XLSX 文件没有可解析的工作表。", 400);
  }

  return {
    format: "xlsx",
    sheets: sheets.map((sheet, index) => {
      const sheetXml = zipEntryText(data, entryByName, sheet.target);
      if (!sheetXml) {
        return {
          name: sheet.name,
          index,
          hidden: sheet.hidden,
          rows: [],
          mergedRanges: [],
        };
      }

      return {
        name: sheet.name,
        index,
        hidden: sheet.hidden,
        rows: parseXlsxRows(sheetXml, sharedStrings),
        mergedRanges: parseXlsxMergedRanges(sheetXml),
      };
    }),
  };
}

function sectorOffset(sector: number, sectorSize: number): number {
  return (sector + 1) * sectorSize;
}

function parseOleFat(data: Buffer, sectorSize: number): number[] {
  const fatSectorIds: number[] = [];
  for (let offset = 76; offset < 76 + 109 * 4; offset += 4) {
    const sector = data.readInt32LE(offset);
    if (sector >= 0) fatSectorIds.push(sector);
  }

  if (fatSectorIds.length === 0) {
    throw new StudentImportOperationError("XLS 文件缺少 FAT 目录。", 400);
  }

  const fat: number[] = [];
  for (const fatSectorId of fatSectorIds) {
    const offset = sectorOffset(fatSectorId, sectorSize);
    if (offset + sectorSize > data.length) {
      throw new StudentImportOperationError("XLS 文件 FAT 目录损坏。", 400);
    }

    for (let cursor = offset; cursor < offset + sectorSize; cursor += 4) {
      fat.push(data.readInt32LE(cursor));
    }
  }

  return fat;
}

function readOleChain(
  data: Buffer,
  fat: number[],
  startSector: number,
  sectorSize: number,
  maxSectors: number,
): Buffer {
  const chunks: Buffer[] = [];
  const visited = new Set<number>();
  let sector = startSector;

  while (sector >= 0) {
    if (visited.has(sector) || visited.size >= maxSectors) {
      throw new StudentImportOperationError("XLS 文件扇区链损坏。", 400);
    }
    visited.add(sector);

    const offset = sectorOffset(sector, sectorSize);
    if (offset + sectorSize > data.length) {
      throw new StudentImportOperationError("XLS 文件扇区越界。", 400);
    }
    chunks.push(data.subarray(offset, offset + sectorSize));

    const next = fat[sector];
    if (next === OLE_ENDOFCHAIN) break;
    if (next === undefined || next < 0) {
      throw new StudentImportOperationError("XLS 文件扇区链损坏。", 400);
    }
    sector = next;
  }

  return Buffer.concat(chunks);
}

function parseOleDirectoryEntries(directory: Buffer): OleDirectoryEntry[] {
  const entries: OleDirectoryEntry[] = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = directory.readUInt16LE(offset + 64);
    if (nameLength < 2 || nameLength > 64) continue;

    const name = directory
      .subarray(offset, offset + nameLength - 2)
      .toString("utf16le");
    const type = directory.readUInt8(offset + 66);
    const startingSector = directory.readInt32LE(offset + 116);
    const rawStreamSize = directory.readBigUInt64LE(offset + 120);
    const streamSize =
      rawStreamSize > BigInt(Number.MAX_SAFE_INTEGER)
        ? Number.MAX_SAFE_INTEGER
        : Number(rawStreamSize);

    entries.push({ name, type, startingSector, streamSize });
  }
  return entries;
}

function workbookStreamFromXls(data: Buffer): Buffer {
  if (!startsWith(data, XLS_OLE_HEADER)) {
    throw new StudentImportOperationError("XLS 文件内容不是合法工作簿。", 400);
  }
  if (data.length < 512) {
    throw new StudentImportOperationError("XLS 文件头不完整。", 400);
  }

  const sectorSize = 1 << data.readUInt16LE(30);
  if (sectorSize !== 512 && sectorSize !== 4096) {
    throw new StudentImportOperationError("XLS 文件扇区大小无效。", 400);
  }

  const firstDirectorySector = data.readInt32LE(48);
  if (firstDirectorySector < 0 || firstDirectorySector === OLE_FREESECT) {
    throw new StudentImportOperationError("XLS 文件缺少目录。", 400);
  }

  const fat = parseOleFat(data, sectorSize);
  const directory = readOleChain(
    data,
    fat,
    firstDirectorySector,
    sectorSize,
    1024,
  );
  const workbookEntry = parseOleDirectoryEntries(directory).find(
    (entry) =>
      entry.type === 2 &&
      (entry.name.toLowerCase() === "workbook" ||
        entry.name.toLowerCase() === "book"),
  );

  if (!workbookEntry) {
    throw new StudentImportOperationError(
      "XLS 文件缺少 Workbook 数据流。",
      400,
    );
  }

  return readOleChain(
    data,
    fat,
    workbookEntry.startingSector,
    sectorSize,
    4096,
  ).subarray(0, workbookEntry.streamSize);
}

function readBiffRecords(stream: Buffer): BiffRecord[] {
  const records: BiffRecord[] = [];
  let offset = 0;
  while (offset + 4 <= stream.length) {
    const type = stream.readUInt16LE(offset);
    const length = stream.readUInt16LE(offset + 2);
    const payloadStart = offset + 4;
    const payloadEnd = payloadStart + length;
    if (payloadEnd > stream.length) break;
    records.push({
      type,
      payload: stream.subarray(payloadStart, payloadEnd),
      startOffset: offset,
      endOffset: payloadEnd,
    });
    offset = payloadEnd;
  }
  return records;
}

function readBiffShortString(payload: Buffer, offset: number): string {
  if (offset + 2 > payload.length) return "";
  const charCount = payload.readUInt8(offset);
  const options = payload.readUInt8(offset + 1);
  const textOffset = offset + 2;
  const byteCount = charCount * ((options & 0x01) === 0x01 ? 2 : 1);
  if (textOffset + byteCount > payload.length) return "";
  return payload
    .subarray(textOffset, textOffset + byteCount)
    .toString((options & 0x01) === 0x01 ? "utf16le" : "latin1");
}

function readBiffUnicodeString(
  payload: Buffer,
  offset: number,
): { value: string; nextOffset: number } | null {
  if (offset + 3 > payload.length) return null;
  const charCount = payload.readUInt16LE(offset);
  const options = payload.readUInt8(offset + 2);
  let cursor = offset + 3;
  const richTextRunCount =
    (options & 0x08) === 0x08 ? payload.readUInt16LE(cursor) : 0;
  if ((options & 0x08) === 0x08) cursor += 2;
  const phoneticSize =
    (options & 0x04) === 0x04 ? payload.readUInt32LE(cursor) : 0;
  if ((options & 0x04) === 0x04) cursor += 4;
  const byteCount = charCount * ((options & 0x01) === 0x01 ? 2 : 1);
  if (cursor + byteCount > payload.length) return null;
  const value = payload
    .subarray(cursor, cursor + byteCount)
    .toString((options & 0x01) === 0x01 ? "utf16le" : "latin1");
  cursor += byteCount + richTextRunCount * 4 + phoneticSize;
  return { value, nextOffset: cursor };
}

function parseXlsBoundSheets(records: readonly BiffRecord[]): XlsSheetMeta[] {
  const sheets: XlsSheetMeta[] = [];
  for (const record of records) {
    if (record.type !== 0x0085 || record.payload.length < 8) continue;
    sheets.push({
      startOffset: record.payload.readUInt32LE(0),
      hidden: record.payload.readUInt8(4) !== 0,
      sheetType: record.payload.readUInt8(5),
      name:
        readBiffShortString(record.payload, 6) || `Sheet${sheets.length + 1}`,
    });
  }
  return sheets;
}

function collectSstPayload(
  records: readonly BiffRecord[],
  startIndex: number,
): Buffer {
  const chunks = [records[startIndex]?.payload ?? Buffer.alloc(0)];
  for (let index = startIndex + 1; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.type !== 0x003c) break;
    chunks.push(record.payload);
  }
  return Buffer.concat(chunks);
}

function parseXlsSharedStrings(records: readonly BiffRecord[]): string[] {
  const sstIndex = records.findIndex((record) => record.type === 0x00fc);
  if (sstIndex < 0) return [];

  const payload = collectSstPayload(records, sstIndex);
  if (payload.length < 8) return [];
  const uniqueStringCount = payload.readUInt32LE(4);
  const strings: string[] = [];
  let offset = 8;
  for (
    let index = 0;
    index < uniqueStringCount && offset < payload.length;
    index += 1
  ) {
    const parsed = readBiffUnicodeString(payload, offset);
    if (!parsed) break;
    strings.push(parsed.value);
    offset = parsed.nextOffset;
  }
  return strings;
}

function biffCellBase(
  payload: Buffer,
): { rowNumber: number; columnIndex: number } | null {
  if (payload.length < 6) return null;
  return {
    rowNumber: payload.readUInt16LE(0) + 1,
    columnIndex: payload.readUInt16LE(2),
  };
}

function setBiffCell(
  rows: Map<number, Map<number, ParsedSpreadsheetCell>>,
  cell: ParsedSpreadsheetCell,
): void {
  const row =
    rows.get(cell.rowNumber) ?? new Map<number, ParsedSpreadsheetCell>();
  row.set(cell.columnIndex, cell);
  rows.set(cell.rowNumber, row);
}

function biffStringCell(
  rowNumber: number,
  columnIndex: number,
  value: string,
  hasFormula = false,
): ParsedSpreadsheetCell {
  return {
    rowNumber,
    columnIndex,
    columnName: columnNameFromIndex(columnIndex),
    value,
    rawValue: value,
    type: value ? "string" : "blank",
    hasFormula,
  };
}

function biffNumericCell(
  rowNumber: number,
  columnIndex: number,
  value: number,
  hasFormula = false,
): ParsedSpreadsheetCell {
  const text = Number.isFinite(value) ? String(value) : "";
  return {
    rowNumber,
    columnIndex,
    columnName: columnNameFromIndex(columnIndex),
    value: text,
    rawValue: text,
    type: text ? "number" : "blank",
    hasFormula,
  };
}

function decodeRkNumber(raw: number): number {
  let value: number;
  if ((raw & 0x02) === 0x02) {
    const signed = raw >> 2;
    value = signed;
  } else {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(0, 0);
    buffer.writeUInt32LE(raw & 0xfffffffc, 4);
    value = buffer.readDoubleLE(0);
  }
  return (raw & 0x01) === 0x01 ? value / 100 : value;
}

function parseBiffMergedRanges(
  payload: Buffer,
): ParsedSpreadsheetMergedRange[] {
  if (payload.length < 2) return [];
  const count = payload.readUInt16LE(0);
  const ranges: ParsedSpreadsheetMergedRange[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 2 + index * 8;
    if (offset + 8 > payload.length) break;
    const startRow = payload.readUInt16LE(offset) + 1;
    const endRow = payload.readUInt16LE(offset + 2) + 1;
    const startColumnIndex = payload.readUInt16LE(offset + 4);
    const endColumnIndex = payload.readUInt16LE(offset + 6);
    ranges.push({
      ref: `${columnNameFromIndex(startColumnIndex)}${startRow}:${columnNameFromIndex(endColumnIndex)}${endRow}`,
      startRow,
      endRow,
      startColumnIndex,
      endColumnIndex,
    });
  }
  return ranges;
}

function parseXlsSheet(
  records: readonly BiffRecord[],
  sheet: XlsSheetMeta,
  sheetIndex: number,
  sharedStrings: readonly string[],
): ParsedSpreadsheetSheet {
  const rows = new Map<number, Map<number, ParsedSpreadsheetCell>>();
  const mergedRanges: ParsedSpreadsheetMergedRange[] = [];
  const startIndex = records.findIndex(
    (record) => record.startOffset === sheet.startOffset,
  );
  const initialIndex = startIndex >= 0 ? startIndex : 0;

  for (let index = initialIndex; index < records.length; index += 1) {
    const record = records[index];
    if (!record) break;
    if (index > initialIndex && record.type === 0x0809) break;
    if (index > initialIndex && record.type === 0x000a) break;

    if (record.type === 0x0208 && record.payload.length >= 2) {
      const rowNumber = record.payload.readUInt16LE(0) + 1;
      rows.set(rowNumber, rows.get(rowNumber) ?? new Map());
      continue;
    }

    if (record.type === 0x00fd && record.payload.length >= 10) {
      const base = biffCellBase(record.payload);
      if (!base) continue;
      const sharedStringIndex = record.payload.readUInt32LE(6);
      setBiffCell(
        rows,
        biffStringCell(
          base.rowNumber,
          base.columnIndex,
          sharedStrings[sharedStringIndex] ?? "",
        ),
      );
      continue;
    }

    if (record.type === 0x0204 && record.payload.length >= 8) {
      const base = biffCellBase(record.payload);
      const parsed = readBiffUnicodeString(record.payload, 6);
      if (!base || !parsed) continue;
      setBiffCell(
        rows,
        biffStringCell(base.rowNumber, base.columnIndex, parsed.value),
      );
      continue;
    }

    if (record.type === 0x0203 && record.payload.length >= 14) {
      const base = biffCellBase(record.payload);
      if (!base) continue;
      setBiffCell(
        rows,
        biffNumericCell(
          base.rowNumber,
          base.columnIndex,
          record.payload.readDoubleLE(6),
        ),
      );
      continue;
    }

    if (record.type === 0x027e && record.payload.length >= 10) {
      const base = biffCellBase(record.payload);
      if (!base) continue;
      setBiffCell(
        rows,
        biffNumericCell(
          base.rowNumber,
          base.columnIndex,
          decodeRkNumber(record.payload.readUInt32LE(6)),
        ),
      );
      continue;
    }

    if (record.type === 0x00bd && record.payload.length >= 10) {
      const rowNumber = record.payload.readUInt16LE(0) + 1;
      const firstColumn = record.payload.readUInt16LE(2);
      const lastColumn = record.payload.readUInt16LE(record.payload.length - 2);
      let offset = 4;
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        if (offset + 6 > record.payload.length - 2) break;
        const rk = record.payload.readUInt32LE(offset + 2);
        setBiffCell(
          rows,
          biffNumericCell(rowNumber, column, decodeRkNumber(rk)),
        );
        offset += 6;
      }
      continue;
    }

    if (record.type === 0x0205 && record.payload.length >= 8) {
      const base = biffCellBase(record.payload);
      if (!base) continue;
      const value = record.payload.readUInt8(6);
      const isError = record.payload.readUInt8(7) === 1;
      setBiffCell(rows, {
        rowNumber: base.rowNumber,
        columnIndex: base.columnIndex,
        columnName: columnNameFromIndex(base.columnIndex),
        value: isError ? `#ERR${value}` : value === 1 ? "TRUE" : "FALSE",
        rawValue: String(value),
        type: isError ? "error" : "boolean",
        hasFormula: false,
      });
      continue;
    }

    if (record.type === 0x0006 && record.payload.length >= 14) {
      const base = biffCellBase(record.payload);
      if (!base) continue;
      const value = record.payload.readDoubleLE(6);
      setBiffCell(
        rows,
        biffNumericCell(base.rowNumber, base.columnIndex, value, true),
      );
      continue;
    }

    if (record.type === 0x00e5) {
      mergedRanges.push(...parseBiffMergedRanges(record.payload));
    }
  }

  return {
    name: sheet.name,
    index: sheetIndex,
    hidden: sheet.hidden || sheet.sheetType !== 0,
    mergedRanges,
    rows: Array.from(rows.entries())
      .sort(([left], [right]) => left - right)
      .map(([rowNumber, cellMap]) => ({
        rowNumber,
        cells: Array.from(cellMap.values()).sort(
          (left, right) => left.columnIndex - right.columnIndex,
        ),
      })),
  };
}

function parseXlsWorkbook(data: Buffer): ParsedSpreadsheetWorkbook {
  const stream = workbookStreamFromXls(data);
  const records = readBiffRecords(stream);
  if (records.length === 0) {
    throw new StudentImportOperationError(
      "XLS 文件没有可解析的数据记录。",
      400,
    );
  }

  const sharedStrings = parseXlsSharedStrings(records);
  const boundSheets = parseXlsBoundSheets(records).filter(
    (sheet) => sheet.sheetType === 0,
  );
  const fallbackSheets =
    boundSheets.length > 0
      ? boundSheets
      : records
          .filter(
            (record) =>
              record.type === 0x0809 &&
              record.payload.length >= 4 &&
              record.payload.readUInt16LE(2) === 0x0010,
          )
          .map((record, index) => ({
            name: `Sheet${index + 1}`,
            startOffset: record.startOffset,
            hidden: false,
            sheetType: 0,
          }));

  if (fallbackSheets.length === 0) {
    throw new StudentImportOperationError("XLS 文件没有可解析的工作表。", 400);
  }

  return {
    format: "xls",
    sheets: fallbackSheets.map((sheet, index) =>
      parseXlsSheet(records, sheet, index, sharedStrings),
    ),
  };
}

export function parseSpreadsheetWorkbook(
  format: StudentRosterExtension,
  data: Buffer,
): ParsedSpreadsheetWorkbook {
  switch (format) {
    case "csv":
      return parseCsvWorkbook(data);
    case "xlsx":
      return parseXlsxWorkbook(data);
    case "xls":
      return parseXlsWorkbook(data);
  }
}
