import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import WordExtractor from "word-extractor";
import BufferReader from "word-extractor/lib/buffer-reader";
import OleCompoundDoc from "word-extractor/lib/ole-compound-doc";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { extractDocxText } from "@/services/question-import/docx-extractor";
import { QuestionImportError } from "@/services/question-import/errors";
import type { QuestionImportFormat } from "@/services/question-import/types";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 2_000_000;
const MAX_PDF_PAGES = 500;
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export interface ExtractedQuestionFile {
  fileName: string;
  format: QuestionImportFormat;
  size: number;
  checksum: string;
  text: string;
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/\u00a0/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#x?[0-9a-f]+|[a-z]+);/giu,
    (match, entity: string) => {
      if (entity.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }
      return named[entity.toLowerCase()] ?? match;
    },
  );
}

function htmlToText(html: string): string {
  return normalizeText(
    decodeHtmlEntities(
      html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
        .replace(/<br\s*\/?\s*>/giu, "\n")
        .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/giu, "\n")
        .replace(/<[^>]+>/gu, ""),
    ),
  );
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

async function extractHtmlFromOleWord(buffer: Buffer): Promise<string> {
  const reader = new BufferReader(buffer);
  await reader.open();
  try {
    const document = await new OleCompoundDoc(reader).read();
    const wordDocument = await readStream(document.stream("WordDocument"));
    const raw = wordDocument.toString("utf8");
    const start = raw.search(/<!doctype\s+html|<html\b/iu);
    if (start < 0) throw new Error("WordDocument stream does not contain HTML");
    const endTag = raw.toLowerCase().lastIndexOf("</html>");
    return htmlToText(
      raw.slice(start, endTag >= start ? endTag + 7 : undefined),
    );
  } finally {
    await reader.close();
  }
}

async function extractWordText(buffer: Buffer, format: "DOC" | "DOCX") {
  try {
    const text = normalizeText(
      format === "DOCX"
        ? await extractDocxText(buffer)
        : (await new WordExtractor().extract(buffer)).getBody(),
    );
    if (text.length >= 10) return text;
  } catch (error: unknown) {
    if (format !== "DOC") throw error;
  }
  if (format === "DOC" && buffer.subarray(0, 8).equals(OLE_MAGIC)) {
    return extractHtmlFromOleWord(buffer);
  }
  throw new QuestionImportError(
    "Word 文件没有可识别的题目文本，请检查文件内容。",
    400,
    "WORD_TEXT_EMPTY",
  );
}

async function extractPdfText(buffer: Buffer): Promise<string> {
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
  try {
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      cMapUrl:
        path.join(process.cwd(), "node_modules", "pdfjs-dist", "cmaps") + "/",
      cMapPacked: true,
      standardFontDataUrl:
        path.join(
          process.cwd(),
          "node_modules",
          "pdfjs-dist",
          "standard_fonts",
        ) + "/",
      isEvalSupported: false,
    });
    const document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new QuestionImportError(
        `PDF 不能超过 ${MAX_PDF_PAGES} 页。`,
        413,
        "PDF_PAGE_LIMIT_EXCEEDED",
      );
    }
    const pages: string[] = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => {
          const candidate = item as { str?: unknown; hasEOL?: unknown };
          return typeof candidate.str === "string"
            ? `${candidate.str}${candidate.hasEOL === true ? "\n" : " "}`
            : "";
        })
        .join("");
      characterCount += text.length;
      if (characterCount > MAX_EXTRACTED_CHARACTERS) {
        throw new QuestionImportError(
          "PDF 可提取文本过多，请拆分后重试。",
          413,
          "PDF_TEXT_LIMIT_EXCEEDED",
        );
      }
      pages.push(text);
    }
    await document.destroy();
    const text = normalizeText(pages.join("\n\n"));
    if (text.length < 10) {
      throw new QuestionImportError(
        "PDF 没有可提取文本，扫描版 PDF 暂不支持 OCR。",
        400,
        "PDF_TEXT_EMPTY",
      );
    }
    return text;
  } catch (error: unknown) {
    if (error instanceof QuestionImportError) throw error;
    const name =
      error && typeof error === "object" && "name" in error
        ? String(error.name)
        : "";
    if (name === "PasswordException") {
      throw new QuestionImportError(
        "PDF 已加密，请移除密码后重试。",
        400,
        "PDF_ENCRYPTED",
      );
    }
    throw new QuestionImportError("PDF 已损坏或无法读取。", 400, "PDF_DAMAGED");
  }
}

function detectFormat(fileName: string, buffer: Buffer): QuestionImportFormat {
  const extension = path.extname(fileName).toLowerCase();
  if (
    extension === ".pdf" &&
    buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))
  )
    return "PDF";
  if (extension === ".docx" && buffer[0] === 0x50 && buffer[1] === 0x4b)
    return "DOCX";
  if (extension === ".doc" && buffer.subarray(0, 8).equals(OLE_MAGIC))
    return "DOC";
  if (extension === ".json") return "JSON";
  if (extension === ".txt") return "TXT";
  throw new QuestionImportError(
    "文件格式与扩展名不匹配，仅支持 .doc、.docx、.pdf、.txt 和 .json。",
    400,
    "QUESTION_FILE_TYPE_INVALID",
  );
}

export async function extractQuestionFile(
  file: File,
): Promise<ExtractedQuestionFile> {
  const fileName = path
    .basename(file.name)
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .slice(0, 255);
  if (!fileName)
    throw new QuestionImportError(
      "文件名无效。",
      400,
      "QUESTION_FILE_NAME_INVALID",
    );
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    throw new QuestionImportError(
      "文件必须大于 0 且不能超过 20 MB。",
      413,
      "QUESTION_FILE_SIZE_INVALID",
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const format = detectFormat(fileName, buffer);
  let text: string;
  if (format === "PDF") text = await extractPdfText(buffer);
  else if (format === "DOC" || format === "DOCX")
    text = await extractWordText(buffer, format);
  else text = normalizeText(buffer.toString("utf8").replace(/^\uFEFF/u, ""));
  if (text.length < 10)
    throw new QuestionImportError(
      "文件没有足够的可识别题目文本。",
      400,
      "QUESTION_FILE_TEXT_EMPTY",
    );
  if (text.length > MAX_EXTRACTED_CHARACTERS) {
    throw new QuestionImportError(
      "文件文本内容过多，请拆分后重试。",
      413,
      "QUESTION_FILE_TEXT_LIMIT_EXCEEDED",
    );
  }
  return {
    fileName,
    format,
    size: file.size,
    checksum: createHash("sha256").update(buffer).digest("hex"),
    text,
  };
}
