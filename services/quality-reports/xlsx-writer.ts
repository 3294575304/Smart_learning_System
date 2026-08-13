import { deflateRawSync } from "node:zlib";

import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const xml = (value: string) =>
  value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

interface Cell {
  value: string | number | null;
  formula?: string;
  style?: number;
}

function cellXml(cell: Cell, row: number, column: number): string {
  const ref = `${columnName(column)}${row}`;
  const style = cell.style ?? (row === 1 ? 1 : 2);
  if (cell.formula)
    return `<c r="${ref}" s="${style}"><f>${xml(cell.formula)}</f><v>${typeof cell.value === "number" ? cell.value : ""}</v></c>`;
  if (typeof cell.value === "number")
    return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(cell.value ?? "")}</t></is></c>`;
}

function worksheetXml(rows: Cell[][], widths: number[]): string {
  const body = rows
    .map(
      (values, index) =>
        `<row r="${index + 1}"${index === 0 ? ' ht="26" customHeight="1"' : ""}>${values.map((cell, column) => cellXml(cell, index + 1, column)).join("")}</row>`,
    )
    .join("");
  const maxColumn = columnName(
    Math.max(0, ...rows.map((row) => row.length - 1)),
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${maxColumn}${Math.max(1, rows.length)}"/></worksheet>`;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

function zip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data, { level: 6 });
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

function safeSheetName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/[\\/*?:[\]]/gu, " ")
      .trim()
      .slice(0, 31) || "分项";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base.slice(0, 27)}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

export function buildQualityReportWorkbook(
  source: QualityReportSourceSnapshot,
): Buffer {
  const used = new Set<string>(["总评"]);
  const componentSheets = source.components.map((component) => ({
    component,
    name: safeSheetName(component.name, used),
  }));
  const totalRows: Cell[][] = [
    [
      "学号",
      "姓名",
      ...source.components.map((item) => item.name),
      "总评成绩",
      "特殊状态",
    ].map((value) => ({ value })),
    ...source.students.map((student, index) => {
      const excelRow = index + 2;
      const formula = source.components
        .map((component, componentIndex) => {
          const sheet = componentSheets[componentIndex]!.name.replace(
            /'/gu,
            "''",
          );
          return `'${sheet}'!C${excelRow}*${component.weight}`;
        })
        .join("+");
      return [
        { value: student.studentNo, style: 2 },
        { value: student.displayName },
        ...source.components.map((component) => ({
          value: student.componentScores[component.code],
          style: 3,
        })),
        student.status === "SCORED"
          ? { value: student.totalScore, formula, style: 3 }
          : { value: null, style: 3 },
        { value: student.status === "SCORED" ? "" : student.status },
      ];
    }),
  ];
  const sheets = [
    {
      name: "总评",
      rows: totalRows,
      widths: [20, 16, ...source.components.map(() => 16), 16, 18],
    },
    ...componentSheets.map(({ component, name }) => ({
      name,
      rows: [
        ["学号", "姓名", `${component.name}（100分）`, "状态"].map((value) => ({
          value,
        })),
        ...source.students.map((student) => [
          { value: student.studentNo, style: 2 },
          { value: student.displayName },
          { value: student.componentScores[component.code], style: 3 },
          { value: student.status === "SCORED" ? "" : student.status },
        ]),
      ],
      widths: [20, 16, 22, 18],
    })),
  ];
  const files: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/styles.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="49" borderId="1" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="2" borderId="1" applyNumberFormat="1" applyBorder="1"/></cellXfs></styleSheet>`,
      ),
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(worksheetXml(sheet.rows, sheet.widths)),
    })),
  ];
  return zip(files);
}
