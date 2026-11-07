import path from "node:path";
import { pathToFileURL } from "node:url";

import { createCanvas } from "@napi-rs/canvas";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { unzipSync } from "fflate";
import sharp from "sharp";

import { extractQuestionFile } from "@/services/question-import/file-extractor";

export type PaperSourceImage = {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  pageNumber: number | null;
  label: string;
};
export type PaperSourceChunk = {
  label: string;
  text: string;
  images: PaperSourceImage[];
};
export type PaperSource = {
  format: string;
  text: string;
  chunks: PaperSourceChunk[];
};

function textChunks(text: string): string[] {
  const lines = text.split(/\n/u);
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current.length + line.length > 12_000 && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += `${line}\n`;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function pdfSource(bytes: Buffer): Promise<PaperSource> {
  GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    ),
  ).href;
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    cMapUrl:
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl:
      path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") +
      "/",
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 50) throw new Error("试卷 PDF 不能超过 50 页");
    const chunks: PaperSourceChunk[] = [];
    let textLength = 0;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => {
          const value = item as { str?: unknown; hasEOL?: unknown };
          return typeof value.str === "string"
            ? `${value.str}${value.hasEOL === true ? "\n" : " "}`
            : "";
        })
        .join("")
        .trim();
      textLength += text.length;
      if (textLength > 2_000_000)
        throw new Error("试卷 PDF 文字过多，请拆分后上传");
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(1.5, 1200 / natural.width, 1600 / natural.height),
      });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const context = canvas.getContext("2d");
      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      const image: PaperSourceImage = {
        bytes: canvas.toBuffer("image/jpeg"),
        mimeType: "image/jpeg",
        width: canvas.width,
        height: canvas.height,
        pageNumber: number,
        label: `第 ${number} 页`,
      };
      chunks.push({ label: image.label, text, images: [image] });
    }
    return {
      format: "PDF",
      text: chunks.map((chunk) => `${chunk.label}\n${chunk.text}`).join("\n\n"),
      chunks,
    };
  } finally {
    await pdf.destroy();
  }
}

async function docxImages(bytes: Buffer): Promise<PaperSourceImage[]> {
  let count = 0;
  const files = unzipSync(bytes, {
    filter: (entry) => {
      if (!/^word\/media\//u.test(entry.name)) return false;
      if (entry.originalSize > 5 * 1024 * 1024 || ++count > 12)
        throw new Error("DOCX 图片过大或超过 12 张，请拆分试卷");
      return true;
    },
  });
  const images: PaperSourceImage[] = [];
  for (const [name, data] of Object.entries(files)) {
    const metadata = await sharp(data)
      .metadata()
      .catch(() => null);
    if (!metadata || !metadata.width || !metadata.height) continue;
    const resized = await sharp(data, { limitInputPixels: 20_000_000 })
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    images.push({
      bytes: resized.data,
      mimeType: "image/jpeg",
      width: resized.info.width,
      height: resized.info.height,
      pageNumber: null,
      label: path.posix.basename(name),
    });
  }
  return images;
}

export async function extractExamPaperSource(
  bytes: Buffer,
  fileName: string,
): Promise<PaperSource> {
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024)
    throw new Error("试卷文件必须大于 0 且不能超过 20 MB");
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf" && bytes.subarray(0, 5).toString() === "%PDF-")
    return pdfSource(bytes);
  const file = new File([new Uint8Array(bytes)], fileName);
  const extracted = await extractQuestionFile(file);
  const images = extracted.format === "DOCX" ? await docxImages(bytes) : [];
  const parts = textChunks(extracted.text);
  return {
    format: extracted.format,
    text: extracted.text,
    chunks: parts.map((text, index) => ({
      label: `文本第 ${index + 1} 段`,
      text,
      images,
    })),
  };
}
