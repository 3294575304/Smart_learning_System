import { strToU8, zipSync } from "fflate";
import type { ExamAnalysisSnapshot } from "./analysis";

const xml = (value: unknown) =>
  String(value ?? "—")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
const display = (value: number | null) =>
  value === null ? "—" : String(value);
function column(index: number) {
  let result = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}
function sheet(rows: string[][]) {
  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row.map((cell, c) => `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`).join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${body}</sheetData></worksheet>`;
}
export function buildExamAnalysisXlsx(snapshot: ExamAnalysisSnapshot): Buffer {
  const overview = [
    ["指标", "数值"],
    ["考试", snapshot.title],
    ["应考人数", String(snapshot.overview.expected)],
    ["实考人数", String(snapshot.overview.participated)],
    ["参考率", display(snapshot.overview.participationRate)],
    ["已公布分数人数", String(snapshot.overview.count)],
    ["均分", display(snapshot.overview.average)],
    ["中位数", display(snapshot.overview.median)],
    ["标准差", display(snapshot.overview.standardDeviation)],
    ["最高分", display(snapshot.overview.highest)],
    ["最低分", display(snapshot.overview.lowest)],
    ["及格率", display(snapshot.overview.passRate)],
    ["优秀率", display(snapshot.overview.excellentRate)],
    ["KR-20 内部一致性", display(snapshot.overview.kr20)],
    ["及格线", String(snapshot.thresholds.pass)],
    ["优秀线", String(snapshot.thresholds.excellent)],
  ];
  const classrooms = [
    [
      "班级",
      "应考",
      "实考",
      "参考率",
      "已公布分数",
      "均分",
      "中位数",
      "标准差",
      "及格率",
      "优秀率",
      "特殊状态",
      "未评分",
    ],
    ...snapshot.classrooms.map((item) => [
      item.name,
      String(item.expected),
      String(item.participated),
      display(item.participationRate),
      String(item.stats.count),
      display(item.stats.average),
      display(item.stats.median),
      display(item.stats.standardDeviation),
      display(item.stats.passRate),
      display(item.stats.excellentRate),
      String(item.special),
      String(item.unscored),
    ]),
  ];
  const questions = [
    [
      "题号",
      "题目",
      "题型",
      "满分",
      "作答数",
      "已判分",
      "平均分",
      "难度P",
      "区分度D",
      "正确率",
      "平均用时ms",
      "选项分布",
    ],
    ...snapshot.questions.map((item) => [
      String(item.number),
      item.title,
      item.type,
      String(item.points),
      String(item.answered),
      String(item.judged),
      display(item.averageScore),
      display(item.difficulty),
      display(item.discrimination),
      display(item.accuracy),
      display(item.averageTimeMs),
      item.options.map((o) => `${o.label}:${display(o.rate)}%`).join("；"),
    ]),
  ];
  const sheets = [
    { name: "概览", rows: overview },
    { name: "班级", rows: classrooms },
    { name: "题目", rows: questions },
  ];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((item, i) => `<sheet name="${item.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
    ),
  };
  sheets.forEach((item, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheet(item.rows));
  });
  return Buffer.from(zipSync(files, { level: 6 }));
}
