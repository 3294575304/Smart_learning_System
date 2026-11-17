import { extractQuestionFile } from "@/services/question-import/file-extractor";
import { SYLLABUS_MAX_EXTRACTED_CHARACTERS } from "@/services/syllabus-parsing/constants";
import { SyllabusParseOperationError } from "@/services/syllabus-parsing/errors";
import { extractTextFromPdf } from "@/services/syllabus-parsing/pdf-extractor";

export async function extractSyllabusText(data: Buffer, fileName: string) {
  if (fileName.toLowerCase().endsWith(".pdf")) return extractTextFromPdf(data);
  try {
    const source = await extractQuestionFile(
      new File([new Uint8Array(data)], fileName),
    );
    if (source.format !== "DOC" && source.format !== "DOCX") {
      throw new Error("Unsupported syllabus format");
    }
    if (source.text.length > SYLLABUS_MAX_EXTRACTED_CHARACTERS) {
      throw new SyllabusParseOperationError(
        "教学大纲可提取文本过多，请精简文件后重试。",
        413,
        "WORD_TEXT_LIMIT_EXCEEDED",
      );
    }
    // Word 文本提取不保留可靠的分页；将整篇作为一个可核对的来源单元。
    return {
      pages: [{ pageNumber: 1, text: source.text }],
      pageCount: 1,
      characterCount: source.text.length,
    };
  } catch (error: unknown) {
    if (error instanceof SyllabusParseOperationError) throw error;
    throw new SyllabusParseOperationError(
      "教学大纲 Word 文件已损坏或没有可提取文本，请更换文件后重试。",
      400,
      "WORD_DAMAGED_OR_EMPTY",
    );
  }
}
