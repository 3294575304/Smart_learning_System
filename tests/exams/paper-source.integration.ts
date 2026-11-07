import assert from "node:assert/strict";
import test from "node:test";

import { createCanvas } from "@napi-rs/canvas";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument } from "pdf-lib";

import { extractExamPaperSource } from "@/services/exams/paper-source";

function paperImage() {
  const canvas = createCanvas(400, 200);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, 400, 200);
  context.fillStyle = "black";
  context.font = "24px sans-serif";
  context.fillText("1. What is 2 + 2?", 20, 80);
  return canvas.toBuffer("image/png");
}

test("扫描 PDF 保留逐页图像供视觉 AI 识别", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([400, 200]);
  const image = await pdf.embedPng(paperImage());
  page.drawImage(image, { x: 0, y: 0, width: 400, height: 200 });
  const source = await extractExamPaperSource(
    Buffer.from(await pdf.save()),
    "scan.pdf",
  );
  assert.equal(source.format, "PDF");
  assert.equal(source.chunks.length, 1);
  assert.equal(source.chunks[0].text, "");
  assert.equal(source.chunks[0].images[0].pageNumber, 1);
  assert.equal(source.chunks[0].images[0].mimeType, "image/jpeg");
});

test("DOCX 文字与嵌入图片一起送审", async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Question one: explain the graph.</w:t></w:r></w:p></w:body></w:document>`;
  const bytes = zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(xml),
    "word/media/image1.png": paperImage(),
  });
  const source = await extractExamPaperSource(Buffer.from(bytes), "paper.docx");
  assert.equal(source.format, "DOCX");
  assert.match(source.text, /explain the graph/u);
  assert.equal(source.chunks[0].images.length, 1);
  assert.equal(source.chunks[0].images[0].pageNumber, null);
});
