import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  SYLLABUS_MAX_EXTRACTED_CHARACTERS,
  SYLLABUS_MAX_PAGES,
} from "@/services/syllabus-parsing/constants";
import { SyllabusParseOperationError } from "@/services/syllabus-parsing/errors";

export interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
}

export interface ExtractedPdfText {
  pages: ExtractedPdfPage[];
  pageCount: number;
  characterCount: number;
}

interface PdfTextItem {
  str?: unknown;
  hasEOL?: unknown;
}

export async function extractTextFromPdf(
  data: Buffer,
): Promise<ExtractedPdfText> {
  if (!data.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new SyllabusParseOperationError(
      "当前教学大纲不是合法 PDF，无法解析。",
      400,
      "INVALID_PDF",
    );
  }

  try {
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
    const loadingTask = getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
      isEvalSupported: false,
    });
    const document = await loadingTask.promise;
    if (document.numPages > SYLLABUS_MAX_PAGES) {
      throw new SyllabusParseOperationError(
        `教学大纲页数不能超过 ${SYLLABUS_MAX_PAGES} 页。`,
        413,
        "PDF_PAGE_LIMIT_EXCEEDED",
      );
    }

    const pages: ExtractedPdfPage[] = [];
    let characterCount = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => {
          const candidate = item as PdfTextItem;
          return typeof candidate.str === "string"
            ? `${candidate.str}${candidate.hasEOL === true ? "\n" : " "}`
            : "";
        })
        .join("")
        .replace(/[ \t]+\n/gu, "\n")
        .replace(/[ \t]{2,}/gu, " ")
        .trim();
      if (!text) continue;
      characterCount += text.length;
      if (characterCount > SYLLABUS_MAX_EXTRACTED_CHARACTERS) {
        throw new SyllabusParseOperationError(
          "教学大纲可提取文本过多，请精简文件后重试。",
          413,
          "PDF_TEXT_LIMIT_EXCEEDED",
        );
      }
      pages.push({ pageNumber, text });
    }

    await document.destroy();
    if (pages.length === 0 || characterCount < 20) {
      throw new SyllabusParseOperationError(
        "教学大纲没有可提取文本，可能是扫描版 PDF；本阶段不支持 OCR，请更换文本型 PDF。",
        400,
        "PDF_TEXT_EMPTY",
      );
    }
    return { pages, pageCount: document.numPages, characterCount };
  } catch (error: unknown) {
    if (error instanceof SyllabusParseOperationError) throw error;
    const name =
      error && typeof error === "object" && "name" in error
        ? String(error.name)
        : "";
    if (name === "PasswordException") {
      throw new SyllabusParseOperationError(
        "教学大纲 PDF 已加密，请移除密码后重试。",
        400,
        "PDF_ENCRYPTED",
      );
    }
    throw new SyllabusParseOperationError(
      "教学大纲 PDF 已损坏或无法读取，请更换文件后重试。",
      400,
      "PDF_DAMAGED",
    );
  }
}
