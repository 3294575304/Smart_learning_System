/**
 * 题干小节解析。
 *
 * 题目内容是一段纯文本，小节靠行首的名字区分（如「编程任务」「输入格式」）。
 * 这里把它切成小节，交给渲染层给出标题层级；同时负责剔除重复的样例小节——
 * 冻结配置里已经有一条结构化公开样例，题干里再写一遍会出现两份。
 *
 * 边界：
 * - 只影响视图，不改 `contentSnapshot` 存储值（历史快照不可变）。
 * - 代码围栏内的行一律不当标题。
 * - 只认白名单里的小节名；认不出来就当作正文，不删任何内容。
 */
export interface ProgrammingStatementSection {
  /** null 表示没有小节的正文（题干是纯叙述时）。 */
  title: string | null;
  body: string;
}

const SECTION_NAMES = [
  "题目描述",
  "问题描述",
  "题目背景",
  "知识点",
  "考察点",
  "编程任务",
  "任务要求",
  "输入格式",
  "输出格式",
  "输入描述",
  "输出描述",
  "数据范围",
  "数据规模",
  "样例说明",
  "样例解释",
  "提示",
  "说明",
  "要求",
  "注意",
  "评分要点",
  "评分标准",
];

/** 「公开样例输入 / 样例输出 / 输入 #1」这类名字都不该出现在正文里。 */
const SAMPLE_PATTERNS = [
  /^(?:输入输出|输入与输出)?样例(?:输入|输出)?(?:\s*#?\s*\d+)?$/u,
  /^公开样例(?:输入|输出)?(?:\s*#?\s*\d+)?$/u,
  /^(?:输入|输出)(?:样例|示例)(?:\s*#?\s*\d+)?$/u,
  /^(?:输入|输出)\s*#\s*\d+$/u,
];

function stripMarkup(value: string) {
  return value
    .replace(/^#{1,6}\s*/u, "")
    .replace(/\*\*/gu, "")
    .replace(/[【】[\]]/gu, "")
    .replace(/[：:]\s*$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function classifyLine(
  line: string,
): { sample: boolean; title: string; rest: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return null;

  const colon = trimmed.search(/[：:]/u);
  const rawName = colon === -1 ? trimmed : trimmed.slice(0, colon);
  const name = stripMarkup(rawName);
  if (!name || name.length > 12) return null;
  const rest = colon === -1 ? "" : trimmed.slice(colon + 1).trim();

  if (SAMPLE_PATTERNS.some((pattern) => pattern.test(name)))
    return { sample: true, title: name, rest };
  if (SECTION_NAMES.includes(name)) return { sample: false, title: name, rest };
  return null;
}

export function programmingStatementSections(
  text: string,
  { dropSamples = false }: { dropSamples?: boolean } = {},
): ProgrammingStatementSection[] {
  const sections: ProgrammingStatementSection[] = [];
  let title: string | null = null;
  let body: string[] = [];
  let dropping = false;
  let fenced = false;

  function flush() {
    const joined = body
      .join("\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
    if (!dropping && (title !== null || joined))
      sections.push({ title, body: joined });
    title = null;
    body = [];
    dropping = false;
  }

  for (const line of text.split("\n")) {
    if (line.trim().startsWith("```")) {
      fenced = !fenced;
      body.push(line);
      continue;
    }

    if (!fenced) {
      const heading = classifyLine(line);
      if (heading) {
        flush();
        title = heading.title;
        // 样例小节整段丢弃；`公开样例输入` 后面紧跟着的裸数据也一并跳过。
        dropping = dropSamples && heading.sample;
        if (heading.rest && !dropping) body.push(heading.rest);
        continue;
      }
    }
    body.push(line);
  }
  flush();

  return sections;
}

/**
 * 去掉重复样例小节后的题干文本。
 *
 * 小节标题保持独立成行，交给 `QuestionText` 按统一的标题规则渲染，
 * 所以这里不做任何排版决定，只做「删掉哪几段」。
 */
export function programmingStatementText(text: string) {
  return programmingStatementSections(text, { dropSamples: true })
    .map((section) =>
      section.title ? `${section.title}\n${section.body}`.trim() : section.body,
    )
    .filter(Boolean)
    .join("\n\n");
}
