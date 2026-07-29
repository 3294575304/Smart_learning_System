import { createHash } from "node:crypto";
import path from "node:path";
import { TextDecoder } from "node:util";
import { inflateRawSync } from "node:zlib";

import {
  courseFileUploadConfig,
  studentRosterMimeTypes,
  type StudentRosterExtension,
} from "@/services/course-files/config";
import { CourseFileOperationError } from "@/services/course-files/errors";
import type {
  CourseFileUploadFile,
  ValidatedCourseFile,
} from "@/services/course-files/types";

const MAX_FILE_NAME_LENGTH = 255;
const XLSX_MAX_XML_ENTRY_BYTES = 10 * 1024 * 1024;
const PDF_HEADER = Buffer.from("%PDF-", "ascii");
const WINDOWS_EXE_HEADER = Buffer.from("MZ", "ascii");
const ELF_HEADER = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const MACHO_HEADERS = [
  Buffer.from([0xfe, 0xed, 0xfa, 0xce]),
  Buffer.from([0xfe, 0xed, 0xfa, 0xcf]),
  Buffer.from([0xce, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
];
const XLS_OLE_HEADER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
const ZIP_LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const OLE_FREESECT = -1;
const OLE_ENDOFCHAIN = -2;

interface ParsedSpreadsheetSummary {
  format: StudentRosterExtension;
  rowCount: number | null;
}

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

function startsWith(data: Buffer, header: Buffer): boolean {
  return (
    data.length >= header.length &&
    data.subarray(0, header.length).equals(header)
  );
}

function rejectKnownExecutable(data: Buffer): void {
  if (
    startsWith(data, WINDOWS_EXE_HEADER) ||
    startsWith(data, ELF_HEADER) ||
    startsWith(data, PDF_HEADER) ||
    data.subarray(0, 2).toString("ascii") === "#!" ||
    MACHO_HEADERS.some((header) => startsWith(data, header))
  ) {
    throw new CourseFileOperationError("不允许上传可执行文件或伪装文件。", 400);
  }
}

function cleanedBaseName(rawName: string): string {
  const baseName = path.posix.basename(rawName.replace(/\\/gu, "/")).trim();
  const cleaned = baseName
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/gu, "_")
    .replace(/\s+/gu, " ")
    .trim();

  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new CourseFileOperationError("文件名不能为空。", 400);
  }

  if (cleaned.length <= MAX_FILE_NAME_LENGTH) {
    return cleaned;
  }

  const extension = path.posix.extname(cleaned);
  const baseLength = Math.max(1, MAX_FILE_NAME_LENGTH - extension.length);
  return `${cleaned.slice(0, baseLength)}${extension}`;
}

function rosterExtension(fileName: string): StudentRosterExtension {
  const extension = path.posix.extname(fileName).toLowerCase();
  if (extension === ".csv" || extension === ".xls" || extension === ".xlsx") {
    return extension.slice(1) as StudentRosterExtension;
  }

  throw new CourseFileOperationError(
    "学生名单仅支持 XLS、XLSX 或 CSV 文件。",
    400,
  );
}

function assertMimeType(
  extension: StudentRosterExtension,
  mimeType: string,
): void {
  if (!studentRosterMimeTypes[extension].has(mimeType)) {
    throw new CourseFileOperationError(
      "文件 MIME 类型与学生名单格式不匹配。",
      400,
    );
  }
}

function assertDeclaredSize(size: number): void {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new CourseFileOperationError("文件不能为空。", 400);
  }

  if (size > courseFileUploadConfig.maxFileSizeBytes) {
    throw new CourseFileOperationError(
      `文件不能超过 ${Math.floor(courseFileUploadConfig.maxFileSizeBytes / 1024 / 1024)} MB。`,
      413,
    );
  }
}

function assertActualSize(data: Buffer): void {
  if (data.length === 0) {
    throw new CourseFileOperationError("文件不能为空。", 400);
  }

  if (data.length > courseFileUploadConfig.maxFileSizeBytes) {
    throw new CourseFileOperationError(
      `文件不能超过 ${Math.floor(courseFileUploadConfig.maxFileSizeBytes / 1024 / 1024)} MB。`,
      413,
    );
  }
}

function assertRowLimit(rowCount: number | null): void {
  if (rowCount === null) return;
  const maxTotalRows = courseFileUploadConfig.maxStudentRosterRows + 1;
  if (rowCount > maxTotalRows) {
    throw new CourseFileOperationError(
      `学生名单不能超过 ${courseFileUploadConfig.maxStudentRosterRows} 行数据。`,
      413,
    );
  }
}

function decodeUtf8(data: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new CourseFileOperationError("CSV 文件必须使用 UTF-8 编码。", 400);
  }
}

function countCsvRows(text: string): number {
  let rows = 0;
  let inQuotes = false;
  let atFieldStart = true;
  let rowHasCell = false;
  let rowHasContent = false;

  function finishRow(): void {
    if (rowHasCell || rowHasContent) {
      rows += 1;
    }
    rowHasCell = false;
    rowHasContent = false;
    atFieldStart = true;
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        rowHasCell = true;
        rowHasContent = true;
      }
      continue;
    }

    if (char === '"' && atFieldStart) {
      inQuotes = true;
      rowHasCell = true;
      atFieldStart = false;
      continue;
    }

    if (char === ",") {
      rowHasCell = true;
      atFieldStart = true;
      continue;
    }

    if (char === "\r" || char === "\n") {
      finishRow();
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }

    rowHasCell = true;
    atFieldStart = false;
    if (!/\s/u.test(char)) {
      rowHasContent = true;
    }
  }

  if (inQuotes) {
    throw new CourseFileOperationError("CSV 文件存在未闭合的引号。", 400);
  }

  finishRow();
  return rows;
}

function parseCsv(data: Buffer): ParsedSpreadsheetSummary {
  if (data.includes(0)) {
    throw new CourseFileOperationError("CSV 文件不能包含二进制内容。", 400);
  }

  const rowCount = countCsvRows(decodeUtf8(data));
  if (rowCount === 0) {
    throw new CourseFileOperationError("CSV 文件没有可解析的数据行。", 400);
  }
  assertRowLimit(rowCount);

  return { format: "csv", rowCount };
}

function findEndOfCentralDirectory(data: Buffer): number {
  const earliest = Math.max(0, data.length - 22 - 0xffff);
  for (let offset = data.length - 22; offset >= earliest; offset -= 1) {
    if (data.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new CourseFileOperationError("XLSX 文件不是可解析的 ZIP 工作簿。", 400);
}

function parseZipEntries(data: Buffer): ZipEntry[] {
  if (!startsWith(data, Buffer.from("PK", "ascii"))) {
    throw new CourseFileOperationError("XLSX 文件内容不是合法工作簿。", 400);
  }

  const eocdOffset = findEndOfCentralDirectory(data);
  const diskNumber = data.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = data.readUInt16LE(eocdOffset + 6);
  const totalEntries = data.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = data.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = data.readUInt32LE(eocdOffset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0) {
    throw new CourseFileOperationError("不支持分卷 XLSX 文件。", 400);
  }

  if (
    totalEntries === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new CourseFileOperationError("不支持 ZIP64 XLSX 文件。", 400);
  }

  if (
    centralDirectoryOffset + centralDirectorySize > data.length ||
    centralDirectoryOffset < 0
  ) {
    throw new CourseFileOperationError("XLSX 文件目录损坏。", 400);
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (
      offset + 46 > data.length ||
      data.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new CourseFileOperationError("XLSX 文件目录损坏。", 400);
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
      throw new CourseFileOperationError("XLSX 文件目录损坏。", 400);
    }

    const name = data.subarray(nameStart, nameEnd).toString("utf8");
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..")
    ) {
      throw new CourseFileOperationError("XLSX 文件包含非法路径。", 400);
    }
    if ((flags & 0x1) === 0x1) {
      throw new CourseFileOperationError("不支持加密 XLSX 文件。", 400);
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new CourseFileOperationError(
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
    throw new CourseFileOperationError("XLSX 文件目录损坏。", 400);
  }

  if (entry.uncompressedSize > XLSX_MAX_XML_ENTRY_BYTES) {
    throw new CourseFileOperationError("XLSX 工作表内容过大。", 413);
  }

  const fileNameLength = data.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = data.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > data.length) {
    throw new CourseFileOperationError("XLSX 文件目录损坏。", 400);
  }

  const compressed = data.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) return compressed;
  return inflateRawSync(compressed);
}

function parseXlsx(data: Buffer): ParsedSpreadsheetSummary {
  const entries = parseZipEntries(data);
  const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
  const worksheetEntries = entries.filter((entry) =>
    /^xl\/worksheets\/sheet\d+\.xml$/u.test(entry.name),
  );

  if (
    !entryByName.has("[Content_Types].xml") ||
    !entryByName.has("xl/workbook.xml") ||
    worksheetEntries.length === 0
  ) {
    throw new CourseFileOperationError("XLSX 文件缺少必要工作簿结构。", 400);
  }

  let rowCount = 0;
  for (const worksheet of worksheetEntries) {
    const xml = extractZipEntry(data, worksheet).toString("utf8");
    rowCount += xml.match(/<row\b/gu)?.length ?? 0;
    assertRowLimit(rowCount);
  }

  if (rowCount === 0) {
    throw new CourseFileOperationError("XLSX 文件没有可解析的数据行。", 400);
  }

  return { format: "xlsx", rowCount };
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
    throw new CourseFileOperationError("XLS 文件缺少 FAT 目录。", 400);
  }

  const fat: number[] = [];
  for (const fatSectorId of fatSectorIds) {
    const offset = sectorOffset(fatSectorId, sectorSize);
    if (offset + sectorSize > data.length) {
      throw new CourseFileOperationError("XLS 文件 FAT 目录损坏。", 400);
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
      throw new CourseFileOperationError("XLS 文件扇区链损坏。", 400);
    }
    visited.add(sector);

    const offset = sectorOffset(sector, sectorSize);
    if (offset + sectorSize > data.length) {
      throw new CourseFileOperationError("XLS 文件扇区越界。", 400);
    }
    chunks.push(data.subarray(offset, offset + sectorSize));

    const next = fat[sector];
    if (next === OLE_ENDOFCHAIN) break;
    if (next === undefined || next < 0) {
      throw new CourseFileOperationError("XLS 文件扇区链损坏。", 400);
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

function parseBiffRowCount(workbookStream: Buffer): number | null {
  const rows = new Set<number>();
  let offset = 0;
  let parsedRecords = 0;

  while (offset + 4 <= workbookStream.length) {
    const recordType = workbookStream.readUInt16LE(offset);
    const recordLength = workbookStream.readUInt16LE(offset + 2);
    const recordStart = offset + 4;
    const recordEnd = recordStart + recordLength;
    if (recordEnd > workbookStream.length) break;

    parsedRecords += 1;
    if (recordType === 0x0208 && recordLength >= 2) {
      rows.add(workbookStream.readUInt16LE(recordStart));
    }

    offset = recordEnd;
  }

  if (parsedRecords === 0 || rows.size === 0) {
    return null;
  }

  return rows.size;
}

function parseXls(data: Buffer): ParsedSpreadsheetSummary {
  if (!startsWith(data, XLS_OLE_HEADER)) {
    throw new CourseFileOperationError("XLS 文件内容不是合法工作簿。", 400);
  }
  if (data.length < 512) {
    throw new CourseFileOperationError("XLS 文件头不完整。", 400);
  }

  const sectorSize = 1 << data.readUInt16LE(30);
  if (sectorSize !== 512 && sectorSize !== 4096) {
    throw new CourseFileOperationError("XLS 文件扇区大小无效。", 400);
  }

  const firstDirectorySector = data.readInt32LE(48);
  if (firstDirectorySector < 0 || firstDirectorySector === OLE_FREESECT) {
    throw new CourseFileOperationError("XLS 文件缺少目录。", 400);
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
    throw new CourseFileOperationError("XLS 文件缺少 Workbook 数据流。", 400);
  }

  let rowCount: number | null = null;
  if (workbookEntry.startingSector >= 0 && workbookEntry.streamSize > 0) {
    const workbookStream = readOleChain(
      data,
      fat,
      workbookEntry.startingSector,
      sectorSize,
      4096,
    ).subarray(0, workbookEntry.streamSize);
    rowCount = parseBiffRowCount(workbookStream);
    assertRowLimit(rowCount);
  }

  return { format: "xls", rowCount };
}

function parseSpreadsheetByExtension(
  extension: StudentRosterExtension,
  data: Buffer,
): ParsedSpreadsheetSummary {
  switch (extension) {
    case "csv":
      return parseCsv(data);
    case "xls":
      return parseXls(data);
    case "xlsx":
      return parseXlsx(data);
  }
}

export async function validateStudentRosterFile(
  file: CourseFileUploadFile | null | undefined,
): Promise<ValidatedCourseFile> {
  if (!file) {
    throw new CourseFileOperationError("请上传学生名单文件。", 400);
  }

  const originalFileName = cleanedBaseName(file.name);
  const extension = rosterExtension(originalFileName);
  const mimeType = file.type.trim().toLowerCase();
  assertMimeType(extension, mimeType);
  assertDeclaredSize(file.size);

  const data = Buffer.from(await file.arrayBuffer());
  assertActualSize(data);
  rejectKnownExecutable(data);

  const parsed = parseSpreadsheetByExtension(extension, data);
  const checksumSha256 = createHash("sha256").update(data).digest("hex");

  return {
    originalFileName,
    extension,
    mimeType,
    sizeBytes: data.length,
    checksumSha256,
    data,
    metadata: {
      detectedFormat: parsed.format,
      parsedRowCount: parsed.rowCount,
      maxStudentRosterRows: courseFileUploadConfig.maxStudentRosterRows,
      maxFileSizeBytes: courseFileUploadConfig.maxFileSizeBytes,
    },
  };
}
