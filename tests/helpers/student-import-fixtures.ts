import { columnNameFromIndex } from "@/services/student-imports/spreadsheet-parser";
import type { CourseFileUploadFile } from "@/services/course-files/types";

export const officialStudentRosterHeaders = [
  "学年学期(文本)",
  "课程号(文本)",
  "学号(文本)",
  "姓名(文本)",
  "班级(文本)",
  "成绩标识(文本)",
  "期末成绩(100.0%)(文本)",
  "特殊原因(文本)",
  "等级成绩类型(文本)",
  "备注(文本)",
] as const;

export interface CsvFixtureInput {
  headers?: readonly string[];
  rows: readonly string[][];
}

export interface SheetFormulaCell {
  rowNumber: number;
  columnIndex: number;
  formula: string;
  value?: string;
}

export interface SheetFixtureInput {
  name: string;
  headers: readonly string[];
  rows: readonly string[][];
  hidden?: boolean;
  mergedRanges?: readonly string[];
  formulaCells?: readonly SheetFormulaCell[];
}

function escapeCsvCell(value: string): string {
  if (/["\n,\r]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const crcTable = crc32Table();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length + entry.data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    entry.data.copy(local, 30 + name.length);
    locals.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDirectory, end]);
}

function buildCsvRow(values: readonly string[]): string {
  return values.map(escapeCsvCell).join(",");
}

export function buildCsvFixture(input: CsvFixtureInput): Buffer {
  const headers = input.headers ?? officialStudentRosterHeaders;
  const rows = [buildCsvRow(headers)];
  for (const row of input.rows) {
    rows.push(buildCsvRow(row));
  }
  return Buffer.from(`${rows.join("\n")}\n`, "utf8");
}

function xlsxCellRef(rowNumber: number, columnIndex: number): string {
  return `${columnNameFromIndex(columnIndex)}${rowNumber}`;
}

function buildXlsxCellXml(
  rowNumber: number,
  columnIndex: number,
  value: string,
  formulaCell?: SheetFormulaCell,
): string {
  const ref = xlsxCellRef(rowNumber, columnIndex);
  if (formulaCell) {
    return `<c r="${ref}"><f>${escapeXml(formulaCell.formula)}</f><v>${escapeXml(
      formulaCell.value ?? "0",
    )}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function parseCellReference(ref: string): {
  rowNumber: number;
  columnIndex: number;
} {
  const match = /^([A-Z]+)(\d+)$/iu.exec(ref);
  if (!match) {
    throw new Error(`Invalid cell reference: ${ref}`);
  }

  let columnIndex = 0;
  for (const char of match[1] ?? "") {
    columnIndex = columnIndex * 26 + (char.charCodeAt(0) - 64);
  }

  return {
    rowNumber: Number(match[2]),
    columnIndex: columnIndex - 1,
  };
}

function buildXlsxSheetXml(input: SheetFixtureInput): string {
  const formulaCells = new Map(
    (input.formulaCells ?? []).map((cell) => [
      `${cell.rowNumber}:${cell.columnIndex}`,
      cell,
    ]),
  );

  const rows = [
    `<row r="1">${input.headers
      .map((value, columnIndex) =>
        buildXlsxCellXml(
          1,
          columnIndex,
          value,
          formulaCells.get(`1:${columnIndex}`),
        ),
      )
      .join("")}</row>`,
    ...input.rows.map((row, rowIndex) => {
      const rowNumber = rowIndex + 2;
      return `<row r="${rowNumber}">${row
        .map((value, columnIndex) =>
          buildXlsxCellXml(
            rowNumber,
            columnIndex,
            value,
            formulaCells.get(`${rowNumber}:${columnIndex}`),
          ),
        )
        .join("")}</row>`;
    }),
  ];

  const mergedRanges = input.mergedRanges ?? [];
  const mergedXml =
    mergedRanges.length > 0
      ? `<mergeCells count="${mergedRanges.length}">${mergedRanges
          .map((ref) => `<mergeCell ref="${escapeXml(ref)}"/>`)
          .join("")}</mergeCells>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rows.join("")}</sheetData>
  ${mergedXml}
</worksheet>`;
}

export function buildXlsxFixture(sheets: readonly SheetFixtureInput[]): Buffer {
  const sheetEntries = sheets.map((sheet, index) => ({
    xml: buildXlsxSheetXml(sheet),
    name: `xl/worksheets/sheet${index + 1}.xml`,
    relId: `rId${index + 1}`,
    hidden: sheet.hidden === true,
    sheetName: sheet.name,
  }));

  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ...sheetEntries.map(
      (sheet) =>
        `<Override PartName="/${sheet.name}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
    "</Types>",
  ].join("");

  const workbookXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "<sheets>",
    ...sheetEntries.map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.sheetName)}" sheetId="${
          index + 1
        }"${sheet.hidden ? ' state="hidden"' : ""} r:id="${sheet.relId}"/>`,
    ),
    "</sheets>",
    "</workbook>",
  ].join("");

  const workbookRels = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...sheetEntries.map(
      (sheet) =>
        `<Relationship Id="${sheet.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${sheet.name.split("/").pop()}"/>`,
    ),
    "</Relationships>",
  ].join("");

  return buildZip([
    {
      name: "[Content_Types].xml",
      data: Buffer.from(contentTypes, "utf8"),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(workbookXml, "utf8"),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(workbookRels, "utf8"),
    },
    ...sheetEntries.map((sheet) => ({
      name: sheet.name,
      data: Buffer.from(sheet.xml, "utf8"),
    })),
  ]);
}

function biffRecord(type: number, payload: Buffer): Buffer {
  const record = Buffer.alloc(4 + payload.length);
  record.writeUInt16LE(type, 0);
  record.writeUInt16LE(payload.length, 2);
  payload.copy(record, 4);
  return record;
}

function biffShortString(value: string): Buffer {
  const text = Buffer.from(value, "ascii");
  const payload = Buffer.alloc(2 + text.length);
  payload.writeUInt8(text.length, 0);
  payload.writeUInt8(0, 1);
  text.copy(payload, 2);
  return payload;
}

function biffUnicodeString(value: string): Buffer {
  const text = Buffer.from(value, "utf16le");
  const payload = Buffer.alloc(3 + text.length);
  payload.writeUInt16LE(value.length, 0);
  payload.writeUInt8(1, 2);
  text.copy(payload, 3);
  return payload;
}

function biffLabelCell(
  rowNumber: number,
  columnIndex: number,
  value: string,
): Buffer {
  const stringPayload = biffUnicodeString(value);
  const payload = Buffer.alloc(6 + stringPayload.length);
  payload.writeUInt16LE(rowNumber - 1, 0);
  payload.writeUInt16LE(columnIndex, 2);
  payload.writeUInt16LE(0, 4);
  stringPayload.copy(payload, 6);
  return biffRecord(0x0204, payload);
}

function biffFormulaCell(
  rowNumber: number,
  columnIndex: number,
  result = 0,
): Buffer {
  const payload = Buffer.alloc(14);
  payload.writeUInt16LE(rowNumber - 1, 0);
  payload.writeUInt16LE(columnIndex, 2);
  payload.writeUInt16LE(0, 4);
  payload.writeDoubleLE(result, 6);
  return biffRecord(0x0006, payload);
}

function biffMergedRanges(refs: readonly string[]): Buffer {
  const payload = Buffer.alloc(2 + refs.length * 8);
  payload.writeUInt16LE(refs.length, 0);
  refs.forEach((ref, index) => {
    const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/iu.exec(ref);
    if (!match) {
      throw new Error(`Invalid merged range: ${ref}`);
    }
    const start = parseCellReference(`${match[1] ?? ""}${match[2] ?? ""}`);
    const end = parseCellReference(`${match[3] ?? ""}${match[4] ?? ""}`);
    const offset = 2 + index * 8;
    payload.writeUInt16LE(start.rowNumber - 1, offset);
    payload.writeUInt16LE(end.rowNumber - 1, offset + 2);
    payload.writeUInt16LE(start.columnIndex, offset + 4);
    payload.writeUInt16LE(end.columnIndex, offset + 6);
  });
  return biffRecord(0x00e5, payload);
}

function buildOleWorkbook(workbook: Buffer): Buffer {
  const sectorSize = 512;
  const workbookSectorCount = Math.max(
    1,
    Math.ceil(workbook.length / sectorSize),
  );
  const header = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  for (let offset = 76; offset < 512; offset += 4) {
    header.writeInt32LE(-1, offset);
  }
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(3, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44);
  header.writeInt32LE(1, 48);
  header.writeUInt32LE(4096, 56);
  header.writeInt32LE(-2, 60);
  header.writeInt32LE(-2, 68);
  header.writeInt32LE(0, 76);

  const fat = Buffer.alloc(512);
  for (let offset = 0; offset < 512; offset += 4) {
    fat.writeInt32LE(-1, offset);
  }
  fat.writeInt32LE(-3, 0);
  fat.writeInt32LE(-2, 4);
  for (let index = 0; index < workbookSectorCount; index += 1) {
    const sectorId = 2 + index;
    fat.writeInt32LE(
      index === workbookSectorCount - 1 ? -2 : sectorId + 1,
      sectorId * 4,
    );
  }

  const directory = Buffer.alloc(512);
  const rootEntry = Buffer.alloc(128);
  Buffer.from("Root Entry\0", "utf16le").copy(rootEntry, 0);
  rootEntry.writeUInt16LE("Root Entry\0".length * 2, 64);
  rootEntry.writeUInt8(5, 66);
  rootEntry.writeInt32LE(-2, 116);
  rootEntry.writeBigUInt64LE(BigInt(0), 120);
  rootEntry.copy(directory, 0);

  const workbookEntry = Buffer.alloc(128);
  Buffer.from("Workbook\0", "utf16le").copy(workbookEntry, 0);
  workbookEntry.writeUInt16LE("Workbook\0".length * 2, 64);
  workbookEntry.writeUInt8(2, 66);
  workbookEntry.writeInt32LE(2, 116);
  workbookEntry.writeBigUInt64LE(BigInt(workbook.length), 120);
  workbookEntry.copy(directory, 128);

  const workbookSectors = Array.from(
    { length: workbookSectorCount },
    (_, index) => {
      const sector = Buffer.alloc(sectorSize);
      workbook.copy(
        sector,
        0,
        index * sectorSize,
        Math.min(workbook.length, (index + 1) * sectorSize),
      );
      return sector;
    },
  );

  return Buffer.concat([header, fat, directory, ...workbookSectors]);
}

export function buildXlsFixture(input: SheetFixtureInput): Buffer {
  const workbookBof = biffRecord(0x0809, Buffer.from([0x00, 0x06, 0x05, 0x00]));
  const sheetBof = biffRecord(0x0809, Buffer.from([0x00, 0x06, 0x10, 0x00]));
  const headerCells = input.headers.map((value, columnIndex) =>
    biffLabelCell(1, columnIndex, value),
  );
  const dataCells = input.rows.flatMap((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    return row.map((value, columnIndex) => {
      const formulaCell = (input.formulaCells ?? []).find(
        (cell) =>
          cell.rowNumber === rowNumber && cell.columnIndex === columnIndex,
      );
      return formulaCell
        ? biffFormulaCell(
            rowNumber,
            columnIndex,
            Number(formulaCell.value ?? 0),
          )
        : biffLabelCell(rowNumber, columnIndex, value);
    });
  });
  const merged = input.mergedRanges
    ? [biffMergedRanges(input.mergedRanges)]
    : [];
  const eof = biffRecord(0x000a, Buffer.alloc(0));

  const sheetRecords = [sheetBof, ...headerCells, ...dataCells, ...merged, eof];
  const boundSheetName = biffShortString(input.name);
  const boundSheetPayload = Buffer.alloc(6 + boundSheetName.length);
  const sheetStartOffset =
    workbookBof.length + biffRecord(0x0085, boundSheetPayload).length;
  boundSheetPayload.writeUInt32LE(sheetStartOffset, 0);
  boundSheetPayload.writeUInt8(input.hidden ? 1 : 0, 4);
  boundSheetPayload.writeUInt8(0, 5);
  boundSheetName.copy(boundSheetPayload, 6);
  const boundSheet = biffRecord(0x0085, boundSheetPayload);

  return buildOleWorkbook(
    Buffer.concat([workbookBof, boundSheet, ...sheetRecords]),
  );
}

export function uploadBufferAsFile(
  name: string,
  mimeType: string,
  data: Buffer,
  size = data.length,
): CourseFileUploadFile {
  return {
    name,
    type: mimeType,
    size,
    arrayBuffer: async () => Uint8Array.from(data).buffer,
  };
}
