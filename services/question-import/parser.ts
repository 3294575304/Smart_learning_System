import { QuestionType } from "@prisma/client";
import { questionContentReview } from "@/services/questions/content-review";
import { programmingConfigRevisionInputSchema } from "@/services/programming-questions/schemas";

import { inferQuestionKnowledgeTags } from "@/services/question-import/knowledge-tags";
import type {
  QuestionImportDraft,
  QuestionImportFormat,
  QuestionImportOption,
} from "@/services/question-import/types";
import type { QuestionAnswer } from "@/services/questions/types";

const MAX_QUESTIONS = 500;
const OPTION_LINE =
  /^\s*[（(]?([A-Ha-hＡ-Ｈａ-ｈ])(?:[）)]|[、.．：:])\s*(.*)$/u;
const META_LINE =
  /^\s*(?:标题|答案|标准答案|参考答案|解析|难易度|难度|知识点|正确率|使用次数)\s*[：:]/u;

interface SourceBlock {
  originalNumber: string | null;
  text: string;
  section: string;
}

function cleanLine(value: string): string {
  return value
    .replace(/\u00a0/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .trim();
}

function sourceTag(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/u, "").trim();
  return `来源:${stem}`.slice(0, 30);
}

function extractRange(block: string, label: RegExp): string | null {
  const match = label.exec(block);
  if (!match?.[1]) return null;
  return match[1].trim() || null;
}

function sectionBefore(prefix: string): string {
  return (
    [...prefix.split("\n")]
      .reverse()
      .find((line) =>
        /^\s*(?:[一二三四五六七八九十\d]+[、.．]\s*)?(?:单选题|单项选择题?|多选题|多项选择题?|判断题|填空题|简答题|编程题)(?:\s*[（(][^）)]*[）)])?\s*$/u.test(
          line,
        ),
      ) ?? ""
  );
}

function splitByQuestionNumber(text: string): SourceBlock[] {
  const matches = [
    ...text.matchAll(
      /(?:^|\n)[ \t]*(?:[（(](\d{1,6})[）)]|(\d{1,6})[、.．)）])[ \t]*/gu,
    ),
  ];
  if (!matches.length) return [];
  return matches.map((match, index) => ({
    originalNumber: match[1] ?? match[2] ?? null,
    section: sectionBefore(text.slice(0, match.index ?? 0)),
    text: text
      .slice(
        (match.index ?? 0) + match[0].length,
        matches[index + 1]?.index ?? text.length,
      )
      .trim(),
  }));
}

function splitByExportNumber(text: string): SourceBlock[] {
  const matches = [...text.matchAll(/题号\s*[：:]\s*([A-Za-z0-9_-]+)/gu)];
  if (matches.length === 0) return [];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const prefix = text.slice(0, start);
    const section = sectionBefore(prefix);
    return {
      originalNumber: match[1] ?? null,
      section,
      text: text.slice(start, matches[index + 1]?.index ?? text.length).trim(),
    };
  });
}

function looksLikeQuestionStart(line: string): boolean {
  if (META_LINE.test(line) || OPTION_LINE.test(line)) return false;
  return (
    /^(?:单选题|多选题|判断题|填空题|简答题|编程题)\s+\S/u.test(line) ||
    /[？?:：]$/u.test(line) ||
    /下列|以下|下面|表达式|结果是|说法|叙述|错误的是|正确的是|时间复杂度/u.test(
      line,
    )
  );
}

function splitImplicitBlocks(text: string): SourceBlock[] {
  const lines = text.split("\n").map(cleanLine).filter(Boolean);
  const starts = lines.flatMap((line, index) =>
    looksLikeQuestionStart(line) ? [index] : [],
  );
  if (starts.length < 2) {
    return [{ originalNumber: "1", section: "", text: lines.join("\n") }];
  }
  return starts.map((start, index) => ({
    originalNumber: String(index + 1),
    section: "",
    text: lines.slice(start, starts[index + 1] ?? lines.length).join("\n"),
  }));
}

function splitBlocks(text: string): SourceBlock[] {
  const headings = [
    ...text.matchAll(/(?:^|\n)\s*第\s*(\d{1,6})\s*题[ \t：:、.．]*/gu),
  ];
  if (headings.length) {
    return headings.map((match, index) => ({
      originalNumber: match[1] ?? null,
      section: /编程题/u.test(text.slice(0, headings[0]?.index ?? 0))
        ? "编程题"
        : "",
      text: text
        .slice(
          (match.index ?? 0) + match[0].length,
          headings[index + 1]?.index ?? text.length,
        )
        .replace(/^\s*[AB]\s*卷\s*第\s*\d+\s*页\s*$/gmu, "")
        .trim(),
    }));
  }
  const exported = splitByExportNumber(text);
  if (exported.length) return exported;
  const numbered = splitByQuestionNumber(text);
  if (numbered.length) return numbered;
  return splitImplicitBlocks(text);
}

function parseType(
  text: string,
  section: string,
  options: QuestionImportOption[],
): QuestionType {
  // 每题显式题型优先，防止上一题的章节提示或解析污染下一题。
  if (/^(?:\s*)编程任务(?:\s|$)/mu.test(text))
    return QuestionType.PYTHON_PROGRAMMING;
  if (/^\s*(?:多选题|多项选择)(?:\s|[：:])/mu.test(text))
    return QuestionType.MULTIPLE_CHOICE;
  if (/^\s*(?:单选题|单项选择)(?:\s|[：:])/mu.test(text))
    return QuestionType.SINGLE_CHOICE;
  if (/^\s*判断题(?:\s|[：:])/mu.test(text)) return QuestionType.TRUE_FALSE;
  if (/^\s*(?:填空题|程序填空)(?:\s|[：:])/mu.test(text))
    return QuestionType.FILL_BLANK;
  if (/^\s*简答题(?:\s|[：:])/mu.test(text)) return QuestionType.SHORT_ANSWER;
  const marker = `${section}\n${text}`;
  if (/编程任务/u.test(marker) || /编程题/u.test(section))
    return QuestionType.PYTHON_PROGRAMMING;
  if (/多选题|多项选择/u.test(marker)) return QuestionType.MULTIPLE_CHOICE;
  if (/单选题|单项选择/u.test(marker)) return QuestionType.SINGLE_CHOICE;
  if (/判断题/u.test(marker)) return QuestionType.TRUE_FALSE;
  if (/填空题|程序填空/u.test(marker)) return QuestionType.FILL_BLANK;
  if (/程序题|编程题|结果导向编程/u.test(marker))
    return QuestionType.PYTHON_PROGRAMMING;
  if (/简答题/u.test(marker)) return QuestionType.SHORT_ANSWER;
  if (options.length >= 2) {
    const labels = text.match(
      /(?:标准答案|参考答案|答案)\s*[：:]\s*([A-Ha-hＡ-Ｈａ-ｈ](?:[ ,，、;；]*[A-Ha-hＡ-Ｈａ-ｈ])*)/u,
    )?.[1];
    return new Set(
      labels?.normalize("NFKC").toUpperCase().match(/[A-H]/gu) ?? [],
    ).size > 1
      ? QuestionType.MULTIPLE_CHOICE
      : QuestionType.SINGLE_CHOICE;
  }
  if (
    /输入格式/u.test(text) &&
    /输出格式/u.test(text) &&
    /样例输入|参考代码/u.test(text)
  )
    return QuestionType.PYTHON_PROGRAMMING;
  return /(?:标准答案|参考答案|答案)\s*[：:]\s*(?:正确|错误|对|错|true|false|√|×|✓|✗)(?:$|[\s，,。])/iu.test(
    text,
  )
    ? QuestionType.TRUE_FALSE
    : QuestionType.SHORT_ANSWER;
}

function parseOptions(lines: string[]): QuestionImportOption[] {
  const options: QuestionImportOption[] = [];
  let current: QuestionImportOption | null = null;
  for (const line of lines.flatMap((line) =>
    OPTION_LINE.test(line)
      ? line.split(/[ \t]+(?=[（(]?[A-Ha-hＡ-Ｈａ-ｈ](?:[）)]|[、.．：:]))/u)
      : [line],
  )) {
    if (META_LINE.test(line)) {
      current = null;
      continue;
    }
    const matched = OPTION_LINE.exec(line);
    if (matched) {
      current = {
        label:
          matched[1]?.normalize("NFKC").toUpperCase() ??
          String.fromCharCode(65 + options.length),
        content: cleanLine(matched[2] ?? ""),
        sortOrder: options.length + 1,
      };
      options.push(current);
      continue;
    }
    if (current) {
      current.content = cleanLine(`${current.content}\n${line}`);
    }
  }
  return options.filter((option) => option.content);
}

function inferImplicitOptions(lines: string[]): QuestionImportOption[] {
  if (lines.length < 5 || lines.some((line) => META_LINE.test(line))) return [];
  const candidates = lines.slice(-4);
  if (
    candidates.some((line) => looksLikeQuestionStart(line) || line.length > 180)
  )
    return [];
  return candidates.map((content, index) => ({
    label: String.fromCharCode(65 + index),
    content,
    sortOrder: index + 1,
  }));
}

function parseDifficulty(text: string): number {
  const raw =
    text.match(/(?:难易度|难度)\s*[：:]?\s*(\d|[^\n]+)/u)?.[1]?.trim() ?? "";
  if (/难/u.test(raw)) return 5;
  if (/中/u.test(raw)) return 3;
  if (/易/u.test(raw)) return 1;
  const numeric = Number.parseInt(raw, 10);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5
    ? numeric
    : 2;
}

function parseExplicitTags(text: string): string[] {
  const raw = text.match(/^\s*知识点\s*[：:]?\s*([^\n]+)/mu)?.[1] ?? "";
  return (raw.split(/[;；]\s*建议难度/u)[0] ?? "")
    .split(/[、,，;；/]/u)
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 6);
}

function parseAnswer(
  type: QuestionType,
  text: string,
  options: QuestionImportOption[],
): QuestionAnswer | null {
  const raw = extractRange(
    text,
    /(?:标准答案|参考答案|答案)\s*[：:]\s*([\s\S]*?)(?=\n\s*(?:解析|难易度|难度|知识点|正确率|使用次数)\s*[：:]|$)/u,
  );
  if (!raw) return null;
  if (
    type === QuestionType.SINGLE_CHOICE ||
    type === QuestionType.MULTIPLE_CHOICE
  ) {
    const labels = [
      ...new Set(
        (
          raw
            .normalize("NFKC")
            .toUpperCase()
            .match(/^(?:选择|选项|选)?\s*([A-H](?:[\s,，、;/；]*[A-H])*)/u)?.[1]
            ?.match(/[A-H]/gu) ?? []
        ).filter((label) => options.some((option) => option.label === label)),
      ),
    ];
    return labels.length
      ? { kind: "CHOICE", correctOptionLabels: labels }
      : null;
  }
  if (type === QuestionType.TRUE_FALSE) {
    if (/^(?:正确|对|是|true|1|√|✓)(?:$|[\s（(，,。])/iu.test(raw))
      return { kind: "BOOLEAN", value: true };
    if (/^(?:错误|错|否|false|0|×|✗)(?:$|[\s（(，,。])/iu.test(raw))
      return { kind: "BOOLEAN", value: false };
    return null;
  }
  if (type === QuestionType.FILL_BLANK) {
    const acceptableAnswers = raw
      .split(/【或】|[;；]/u)
      .map(cleanLine)
      .filter(Boolean)
      .slice(0, 20);
    return acceptableAnswers.length
      ? { kind: "TEXT", acceptableAnswers, caseSensitive: false }
      : null;
  }
  return { kind: "REFERENCE", value: raw.slice(0, 5000) };
}

function parseExplanation(text: string): string {
  return (
    extractRange(
      text,
      /解析\s*[：:]\s*([\s\S]*?)(?=\n\s*(?:难易度|难度|知识点|正确率|使用次数)\s*[：:]|$)/u,
    ) ?? "来源文件未提供解析，请管理员审核后补充。"
  ).slice(0, 5000);
}

function parseContent(
  lines: string[],
  options: QuestionImportOption[],
): string {
  const firstOptionIndex = options.length
    ? lines.findIndex((line) => OPTION_LINE.test(line))
    : -1;
  const implicitOptionStart =
    firstOptionIndex < 0 && options.length > 0
      ? Math.max(0, lines.length - options.length)
      : lines.length;
  const contentLines = lines.slice(
    0,
    firstOptionIndex >= 0 ? firstOptionIndex : implicitOptionStart,
  );
  return contentLines
    .filter((line) => !META_LINE.test(line))
    .map((line) =>
      line
        .replace(/^题号\s*[：:]\s*\S+(?:\s+本题\s*[：:]\s*\d+\s*分)?/u, "")
        .replace(
          /^\((?:单选题|多选题|判断题|填空题|程序题|简答题|其它)\)\s*/u,
          "",
        ),
    )
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(0, 5000);
}

function titleFor(content: string, originalNumber: string | null): string {
  const oneLine = content.replace(/\s+/gu, " ").trim();
  const prefix = originalNumber ? `[导入题 ${originalNumber}] ` : "[导入题] ";
  return `${prefix}${oneLine || "待补充题目"}`.slice(0, 120);
}

export function validateImportDraft(draft: QuestionImportDraft): string[] {
  const issues: string[] = questionContentReview(draft.content);
  if (draft.title.trim().length < 2) issues.push("题目标题至少需要 2 个字符");
  if (!draft.content.trim()) issues.push("题干不能为空");
  if (!draft.explanation.trim()) issues.push("答案解析不能为空");
  if (!draft.answer) issues.push("来源文件未识别到标准答案，请补充");
  if (
    (draft.type === QuestionType.SINGLE_CHOICE ||
      draft.type === QuestionType.MULTIPLE_CHOICE) &&
    draft.options.length < 2
  ) {
    issues.push("选择题至少需要两个选项");
  }
  if (
    draft.type === QuestionType.MULTIPLE_CHOICE &&
    draft.answer?.kind === "CHOICE" &&
    draft.answer.correctOptionLabels.length < 2
  ) {
    issues.push("多选题至少需要两个正确选项");
  }
  if (
    draft.type === QuestionType.SINGLE_CHOICE &&
    draft.answer?.kind === "CHOICE" &&
    draft.answer.correctOptionLabels.length !== 1
  )
    issues.push("单选题需要且只能有一个正确选项，请校对题型或答案");
  return issues;
}

function draftFromBlock(
  block: SourceBlock,
  index: number,
  fileName: string,
): QuestionImportDraft {
  const configMatch = block.text.match(
    /判题配置开始\s*([\s\S]*?)\s*判题配置结束/u,
  );
  const visibleText = block.text.replace(
    /判题配置开始[\s\S]*?判题配置结束/gu,
    "",
  );
  const lines = visibleText
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  let options = parseOptions(lines);
  if (!options.length) options = inferImplicitOptions(lines);
  const type = parseType(visibleText, block.section, options);
  if (type === QuestionType.PYTHON_PROGRAMMING) options = [];
  const content = parseContent(lines, options);
  const explicitTags = parseExplicitTags(visibleText);
  const tags = [
    "题库导入",
    sourceTag(fileName),
    ...(block.originalNumber
      ? [`原题号:${block.originalNumber}`.slice(0, 30)]
      : []),
    ...inferQuestionKnowledgeTags(
      `${content}\n${options.map((item) => item.content).join("\n")}`,
      explicitTags,
    ),
  ];
  const draft: QuestionImportDraft = {
    rowKey: `${block.originalNumber ?? index + 1}-${index + 1}`,
    originalNumber: block.originalNumber,
    title: (
      visibleText.match(/^\s*标题\s*[：:]\s*([^\n]+)/mu)?.[1]?.trim() ??
      titleFor(
        type === QuestionType.PYTHON_PROGRAMMING
          ? (lines[0] ?? content)
          : content,
        block.originalNumber,
      )
    ).slice(0, 120),
    content,
    type,
    difficulty: parseDifficulty(visibleText),
    options:
      type === QuestionType.SINGLE_CHOICE ||
      type === QuestionType.MULTIPLE_CHOICE
        ? options
        : [],
    answer:
      type === QuestionType.PYTHON_PROGRAMMING
        ? { kind: "PROGRAMMING" }
        : parseAnswer(type, visibleText, options),
    explanation:
      type === QuestionType.PYTHON_PROGRAMMING
        ? visibleText.match(/评分要点\s*[：:]?\s*([\s\S]*)/u)?.[1]?.trim() ||
          "待补充参考代码和判题配置；样例输出不能替代标准答案。"
        : parseExplanation(visibleText),
    tags: [
      ...new Map(tags.map((tag) => [tag.toLocaleLowerCase(), tag])).values(),
    ].slice(0, 10),
    issues: [],
    duplicate: false,
  };
  if (configMatch && type === QuestionType.PYTHON_PROGRAMMING) {
    try {
      const config = programmingConfigRevisionInputSchema.safeParse(
        JSON.parse(configMatch[1] ?? ""),
      );
      if (!config.success)
        throw new Error(config.error.issues[0]?.message ?? "配置不完整");
      draft.programmingConfig = config.data;
    } catch {
      draft.issues.push(
        "判题配置无效：请检查判题配置开始与结束标记之间的 JSON 内容",
      );
      draft.answer = null;
    }
  }
  draft.issues.push(...validateImportDraft(draft));
  return draft;
}

function parseJsonDrafts(
  text: string,
  fileName: string,
): QuestionImportDraft[] {
  const parsed: unknown = JSON.parse(text);
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && "questions" in parsed
      ? (parsed as { questions?: unknown }).questions
      : null;
  if (!Array.isArray(rows))
    throw new Error("JSON 顶层应为题目数组，或包含 questions 数组。");
  return rows.map((row, index) => {
    const item =
      row && typeof row === "object" && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : {};
    const type = Object.values(QuestionType).includes(item.type as QuestionType)
      ? (item.type as QuestionType)
      : QuestionType.SHORT_ANSWER;
    const options = Array.isArray(item.options)
      ? item.options.flatMap((option, optionIndex) => {
          if (!option || typeof option !== "object") return [];
          const value = option as Record<string, unknown>;
          return [
            {
              label: String(
                value.label ?? String.fromCharCode(65 + optionIndex),
              ),
              content: String(value.content ?? ""),
              sortOrder: optionIndex + 1,
            },
          ];
        })
      : [];
    const content = String(item.content ?? "").slice(0, 5000);
    const draft: QuestionImportDraft = {
      rowKey: `json-${index + 1}`,
      originalNumber: String(index + 1),
      title: String(item.title ?? titleFor(content, String(index + 1))).slice(
        0,
        120,
      ),
      content,
      type,
      difficulty: Number(item.difficulty ?? 2),
      options,
      answer:
        item.answer && typeof item.answer === "object"
          ? (item.answer as QuestionAnswer)
          : null,
      explanation: String(
        item.explanation ?? "来源文件未提供解析，请管理员审核后补充。",
      ).slice(0, 5000),
      tags: [
        ...new Set([
          "题库导入",
          sourceTag(fileName),
          ...(Array.isArray(item.tags) ? item.tags : []).map(String),
          ...inferQuestionKnowledgeTags(content),
        ]),
      ]
        .map((tag) => tag.slice(0, 30))
        .slice(0, 10),
      issues: [],
      duplicate: false,
    };
    if (type === QuestionType.PYTHON_PROGRAMMING) {
      draft.answer = { kind: "PROGRAMMING" };
      if (item.programmingConfig !== undefined) {
        const config = programmingConfigRevisionInputSchema.safeParse(
          item.programmingConfig,
        );
        if (config.success) draft.programmingConfig = config.data;
        else {
          draft.answer = null;
          draft.issues.push(
            `判题配置无效：${config.error.issues[0]?.message ?? "请检查配置"}`,
          );
        }
      }
    }
    draft.issues.push(...validateImportDraft(draft));
    return draft;
  });
}

export function parseQuestionImportText(
  text: string,
  format: QuestionImportFormat,
  fileName: string,
): QuestionImportDraft[] {
  const normalized = text
    .replace(
      /^[ \t]*[【\[](?:标准答案|参考答案|答案)[】\]][ \t]*[：:]?[ \t]*/gmu,
      "答案：",
    )
    .replace(
      /^[ \t]*[【\[](?:答案解析|解析)[】\]][ \t]*[：:]?[ \t]*/gmu,
      "解析：",
    )
    .replace(/^[ \t]*答案解析[：:]/gmu, "解析：")
    .replace(
      /^[ \t]*第[ \t]*\d+[ \t]*页(?:[ \t]*[共/][ \t]*\d+[ \t]*页?)?[ \t]*$/gmu,
      "",
    )
    .replace(
      /^[ \t]*([０-９]+)([、.．)）])/gmu,
      (_, digits: string, delimiter: string) =>
        digits.normalize("NFKC") + delimiter,
    );
  const drafts =
    format === "JSON"
      ? parseJsonDrafts(text, fileName)
      : splitBlocks(normalized).map((block, index) =>
          draftFromBlock(
            {
              ...block,
              // 章节标题位于两题之间时属于文档结构，不是上一题的答案或题干。
              text: block.text.replace(
                /\n[ \t]*第[ \t]*[\d一二三四五六七八九十百]+[ \t]*章[^\n]*[ \t]*$/u,
                "",
              ),
            },
            index,
            fileName,
          ),
        );
  if (drafts.length > MAX_QUESTIONS)
    throw new Error(
      `识别到 ${drafts.length} 道题，超过单次 ${MAX_QUESTIONS} 道上限，请拆分文件后导入，系统未截断题目。`,
    );
  return drafts;
}
