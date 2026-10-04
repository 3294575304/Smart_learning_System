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

function displayWidth(value: string): number {
  return [...value].reduce(
    (width, char) => width + (/[^\u0000-\u00ff]/u.test(char) ? 2 : 1),
    0,
  );
}

function worksheetXml(
  rows: Cell[][],
  widths: number[],
  identityColumns: boolean,
): string {
  const body = rows
    .map((values, index) => {
      const height =
        index === 0
          ? 36
          : Math.max(
              26,
              ...values.map((cell, column) => {
                const lines = String(cell.value ?? "")
                  .split("\n")
                  .reduce(
                    (count, line) =>
                      count +
                      Math.max(
                        1,
                        Math.ceil(
                          displayWidth(line) /
                            Math.max(1, (widths[column] ?? 20) - 2),
                        ),
                      ),
                    0,
                  );
                return lines * 16 + 8;
              }),
            );
      return `<row r="${index + 1}" ht="${height}" customHeight="1">${values
        .map((cell, column) => {
          const style = cell.style ?? (index === 0 ? 1 : 2);
          const stripeStyle =
            index > 0 && index % 2 === 0
              ? (({ 2: 5, 3: 6, 4: 7 } as Record<number, number>)[style] ??
                style)
              : style;
          return cellXml({ ...cell, style: stripeStyle }, index + 1, column);
        })
        .join("")}</row>`;
    })
    .join("");
  const maxColumn = columnName(
    Math.max(0, ...rows.map((row) => row.length - 1)),
  );
  const lastRow = Math.max(1, rows.length);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${maxColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ${identityColumns ? 'xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight"' : 'ySplit="1" topLeftCell="A2" activePane="bottomLeft"'} state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="26"/><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData>${identityColumns ? `<autoFilter ref="A1:${maxColumn}${lastRow}"/>` : ""}<printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L&amp;A&amp;R第 &amp;P 页 / 共 &amp;N 页</oddFooter></headerFooter></worksheet>`;
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
  const used = new Set<string>(["总评", "导出说明"]);
  const statusNames: Record<string, string> = {
    SCORED: "",
    NOT_ENTERED: "未录入",
    ABSENT: "缺考",
    DEFERRED: "缓考",
    LEAVE: "请假",
    EXEMPT: "免修",
    CHEATING: "作弊",
    OTHER: "其他",
    COMPLETE: "已完成",
    INCOMPLETE: "待完善",
  };
  const componentSheets = source.components.map((component) => ({
    component,
    name: safeSheetName(component.name, used),
  }));
  const totalRows: Cell[][] = [
    [
      "学号",
      "姓名",
      ...source.components.map(
        (item) => `${item.name}（${Number((item.weight * 100).toFixed(4))}%）`,
      ),
      "总评成绩",
      "特殊状态",
      "加权计算参考",
      "总评说明",
    ].map((value) => ({ value })),
    ...source.students.map((student, index) => {
      const excelRow = index + 2;
      const included = source.components.flatMap(
        (component, componentIndex) => {
          if (
            component.weight === 0 ||
            student.componentStatuses?.[component.code] === "EXEMPT"
          )
            return [];
          return [
            { component, ref: `${columnName(componentIndex + 2)}${excelRow}` },
          ];
        },
      );
      const denominator = included.reduce(
        (sum, item) => sum + item.component.weight,
        0,
      );
      const complete = included.every(
        ({ component }) => student.componentScores[component.code] != null,
      );
      const computed =
        complete && denominator > 0
          ? Number(
              (
                included.reduce(
                  (sum, { component }) =>
                    sum +
                    (student.componentScores[component.code] ?? 0) *
                      component.weight,
                  0,
                ) / denominator
              ).toFixed(2),
            )
          : null;
      const formula =
        denominator > 0
          ? `IF(COUNT(${included.map(({ ref }) => ref).join(",")})=${included.length},ROUND((${included.map(({ component, ref }) => `${ref}*${component.weight}`).join("+")})/${Number(denominator.toFixed(8))},2),"")`
          : undefined;
      const overridden =
        student.totalScoreOverridden ||
        (student.totalScore !== null &&
          (computed === null ||
            Math.abs(student.totalScore - computed) > 0.005));
      return [
        { value: student.studentNo, style: 2 },
        { value: student.displayName },
        ...componentSheets.map(({ component, name }) => ({
          value: student.componentScores[component.code] ?? null,
          formula: `IF('${name.replace(/'/gu, "''")}'!C${excelRow}="","",'${name.replace(/'/gu, "''")}'!C${excelRow})`,
          style: 3,
        })),
        // 正式总评是已确认结果，Excel 重算只能更新参考列，不能改写发布成绩。
        {
          value: student.status === "SCORED" ? student.totalScore : null,
          style: 4,
        },
        { value: statusNames[student.status] ?? "其他" },
        { value: computed, formula, style: 3 },
        {
          value: overridden
            ? "采用已确认总评"
            : student.status === "SCORED"
              ? "按考核方案计算"
              : "特殊状态或成绩未齐",
        },
      ];
    }),
  ];
  const nameWidth = Math.min(
    32,
    Math.max(
      16,
      ...source.students.map(
        (student) => displayWidth(student.displayName) + 2,
      ),
    ),
  );
  const sheets = [
    {
      name: "总评",
      rows: totalRows,
      widths: [
        22,
        nameWidth,
        ...source.components.map((item) =>
          Math.min(32, Math.max(18, displayWidth(item.name) + 10)),
        ),
        16,
        16,
        20,
        28,
      ],
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
          { value: student.componentScores[component.code] ?? null, style: 3 },
          {
            value:
              statusNames[
                student.componentStatuses?.[component.code] ?? student.status
              ] ?? "待核对",
          },
        ]),
      ],
      widths: [
        22,
        nameWidth,
        Math.min(36, Math.max(24, displayWidth(component.name) + 10)),
        18,
      ],
    })),
    {
      name: "导出说明",
      rows: [
        ["项目", "内容"],
        ["课程", source.course.name],
        ["课程号", source.course.courseNo],
        ["学期", source.course.term],
        ["教学班", source.classroom.name],
        [
          "成绩来源",
          source.sourceType === "PLATFORM"
            ? "平台已发布成绩快照"
            : "上传成绩文件",
        ],
        [
          "正式成绩版本",
          String(source.sourceReference.publicationVersion ?? "见报告来源记录"),
        ],
        [
          "发布时间",
          String(source.sourceReference.publishedAt ?? "见报告来源记录"),
        ],
        ["学生人数", source.students.length],
        [
          "总评口径",
          "总评成绩保留已确认结果；加权计算参考随分项调整重算，不覆盖正式成绩。",
        ],
        [
          "缺失与免修",
          "未录入成绩留空；免修分项按考核方案排除并重新分配其余权重。",
        ],
        ...source.components.map((component) => [
          component.name,
          `${Number((component.weight * 100).toFixed(4))}%`,
        ]),
      ].map((row) => row.map((value) => ({ value }))),
      widths: [24, 94],
    },
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
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets><definedNames>${sheets.map((sheet, index) => `<definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${xml(sheet.name.replace(/'/gu, "''"))}'!$1:$1</definedName>`).join("")}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
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
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><color rgb="FF1F4E78"/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F7FC"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="8"><xf/><xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="49" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="2" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="2" fontId="2" borderId="1" applyFont="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="49" fillId="3" borderId="1" applyFill="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="2" fillId="3" borderId="1" applyFill="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="2" fontId="2" fillId="3" borderId="1" applyFont="1" applyFill="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      ),
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(
        worksheetXml(sheet.rows, sheet.widths, sheet.name !== "导出说明"),
      ),
    })),
  ];
  return zip(files);
}
