import { questionSectionTitle } from "@/services/assignments/question-text";

/** The frozen configuration owns the single displayed sample. Suppress imported
 * sample sections only in the view, preserving the original stored statement. */
export function programmingStatementText(text: string) {
  let inSamples = false;
  let fenced = false;
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().startsWith("```")) {
      fenced = !fenced;
      if (!inSamples) lines.push(line);
      continue;
    }
    if (!fenced) {
      const title = questionSectionTitle(line);
      const plain = line
        .trim()
        .replace(/^#{1,6}\s*/u, "")
        .replace(/\*\*/gu, "")
        .replace(/[【】\[\]：:]/gu, "")
        .trim();
      if (
        /^(?:输入(?:输出|与输出)样例|样例(?:输入|输出)|输入(?:样例|示例)|输出(?:样例|示例)|(?:输入|输出)\s*#?\s*\d+)(?:\s*#?\s*\d+)?$/u.test(
          plain,
        )
      ) {
        inSamples = true;
        continue;
      }
      if (title) inSamples = false;
    }
    if (!inSamples) lines.push(line);
  }
  return lines.join("\n").trim();
}
