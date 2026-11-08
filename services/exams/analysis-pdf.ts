import "server-only";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { Role } from "@prisma/client";
import { readAssignmentQuestionImage } from "./paper-images";
import type { ExamAnalysisSnapshot } from "./analysis";

const width = 1240,
  height = 1754,
  margin = 86;
function textLines(
  context: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  value: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 16,
) {
  let y = startY;
  let line = "";
  for (const char of value) {
    if (char === "\n" || context.measureText(line + char).width > maxWidth) {
      context.fillText(line, x, y);
      y += lineHeight;
      line = "";
      if (y > startY + (maxLines - 1) * lineHeight) break;
      if (char === "\n") continue;
    }
    line += char;
  }
  if (line) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}
function pageBase(title: string, page: number) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#075985";
  context.fillRect(0, 0, width, 24);
  context.font = 'bold 39px "Microsoft YaHei", sans-serif';
  context.fillStyle = "#0f172a";
  context.fillText(title.slice(0, 26), margin, 116);
  context.strokeStyle = "#cbd5e1";
  context.beginPath();
  context.moveTo(margin, 145);
  context.lineTo(width - margin, 145);
  context.stroke();
  context.font = '24px "Microsoft YaHei", sans-serif';
  context.fillStyle = "#64748b";
  context.fillText(`考试讲评 · 第 ${page} 页`, margin, height - 64);
  return { canvas, context };
}
export async function buildExamCommentaryPdf(
  snapshot: ExamAnalysisSnapshot,
  teacherId: string,
): Promise<Buffer> {
  const document = await PDFDocument.create();
  const pages: Array<Buffer> = [];
  {
    const { canvas, context } = pageBase(snapshot.title, 1);
    context.fillStyle = "#334155";
    context.font = '30px "Microsoft YaHei", sans-serif';
    const items = [
      `已公布班级 ${snapshot.overview.publishedClassrooms}/${snapshot.overview.totalClassrooms} · 已公布成绩 ${snapshot.overview.count} 人`,
      `应考 ${snapshot.overview.expected} 人 · 实考 ${snapshot.overview.participated} 人`,
      `平均分 ${snapshot.overview.average ?? "—"} · 中位数 ${snapshot.overview.median ?? "—"}`,
      `及格率 ${snapshot.overview.passRate ?? "—"}% · 优秀率 ${snapshot.overview.excellentRate ?? "—"}%`,
      `KR-20 内部一致性 ${snapshot.overview.kr20 ?? "—"}`,
    ];
    items.forEach((item, index) =>
      context.fillText(item, margin, 240 + index * 78),
    );
    context.font = '23px "Microsoft YaHei", sans-serif';
    context.fillStyle = "#64748b";
    textLines(
      context,
      "统计仅含已公布成绩；题目指标来自已公布的逐题批改。台账人工改分不能反推逐题得分。本文不包含学生自由文本答案。",
      margin,
      720,
      width - margin * 2,
      40,
    );
    pages.push(canvas.toBuffer("image/png"));
  }
  for (const [index, question] of snapshot.questions.entries()) {
    const { canvas, context } = pageBase(
      `第 ${question.number} 题 · ${question.title}`,
      index + 2,
    );
    context.font = '26px "Microsoft YaHei", sans-serif';
    context.fillStyle = "#334155";
    let y =
      textLines(
        context,
        question.content,
        margin,
        212,
        width - margin * 2,
        40,
        15,
      ) + 22;
    y = Math.max(y, 550);
    context.fillStyle = "#0369a1";
    context.fillText(
      `正确率 ${question.accuracy ?? "—"}% · 难度 ${question.difficulty ?? "—"} · 区分度 ${question.discrimination ?? "—"}`,
      margin,
      y,
    );
    y += 62;
    const wrong = question.options
      .filter((item) => !item.correct && item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    context.fillStyle = "#334155";
    y =
      textLines(
        context,
        wrong.length
          ? `常见错误选项：${wrong.map((item) => `${item.label}（${item.rate ?? "—"}%）`).join("、")}`
          : "常见错误选项：暂无可统计数据",
        margin,
        y,
        width - margin * 2,
        40,
        3,
      ) + 20;
    for (const imageId of question.imageIds.slice(0, 2)) {
      const image = await readAssignmentQuestionImage(
        { id: teacherId, role: Role.TEACHER },
        imageId,
      );
      const decoded = await loadImage(image.bytes);
      const maxW = width - margin * 2,
        maxH = Math.min(420, height - 120 - y);
      if (maxH <= 20) break;
      const scale = Math.min(maxW / decoded.width, maxH / decoded.height, 1);
      context.drawImage(
        decoded,
        margin,
        y,
        decoded.width * scale,
        decoded.height * scale,
      );
      y += decoded.height * scale + 24;
    }
    pages.push(canvas.toBuffer("image/png"));
  }
  for (const data of pages) {
    const embedded = await document.embedPng(data);
    const page = document.addPage([595.28, 841.89]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
    });
  }
  return Buffer.from(await document.save());
}
