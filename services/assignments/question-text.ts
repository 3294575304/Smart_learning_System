const sectionTitle =
  /^(?:题目(?:描述|背景)|问题描述|输入格式|输出格式|输入(?:输出|与输出)样例|样例(?:输入|输出)(?:\s*#?\s*\d+)?|输入(?:样例|示例)|输出(?:样例|示例)|说明\s*[/／]\s*提示|说明|提示|数据范围(?:与提示)?|数据规模与约定|题目来源)$/u;

export function questionSectionTitle(line: string) {
  const title = line
    .trim()
    .replace(/^#{1,6}\s*/u, "")
    .replace(/^\*\*(.*?)\*\*$/u, "$1")
    .replace(/^[【\[]|[】\]]$/gu, "")
    .replace(/[：:]$/u, "")
    .trim();
  return sectionTitle.test(title) ? title : null;
}

export function questionTextBlocks(text: string) {
  const blocks: Array<{ code: boolean; text: string; heading?: boolean }> = [];
  for (const part of text.split(/(```[^\n]*\n[\s\S]*?```)/g)) {
    if (!part) continue;
    if (part.startsWith("```")) {
      blocks.push({
        code: true,
        text: part.replace(/^```[^\n]*\n/, "").replace(/```$/, ""),
      });
      continue;
    }
    for (const line of part.split("\n")) {
      const inline = /^([^：:\n]+)[：:](.+)$/u.exec(line);
      const title =
        questionSectionTitle(line) ??
        (inline ? questionSectionTitle(inline[1] ?? "") : null);
      if (title) {
        blocks.push({ code: false, text: title, heading: true });
        if (inline?.[2]) blocks.push({ code: false, text: inline[2].trim() });
        continue;
      }
      // Recognize standalone Python, never reformat or execute imported text.
      const code =
        /^\s*(?:(?:from|import|def|class|for|while|if|elif|else|try|except|finally|with|return|raise|print)\b|[A-Za-z_]\w*(?:\[[^\]]*\])?\s*=|#|\s{4}\S)/.test(
          line,
        );
      const previous = blocks.at(-1);
      if (previous && !previous.heading && previous.code === code)
        previous.text += "\n" + line;
      else blocks.push({ code, text: line });
    }
  }
  return blocks;
}
