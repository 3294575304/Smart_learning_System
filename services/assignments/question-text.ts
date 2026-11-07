export function questionTextBlocks(text: string) {
  const blocks: Array<{ code: boolean; text: string }> = [];
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
      // Recognize standalone Python, never reformat or execute imported text.
      const code =
        /^\s*(?:(?:from|import|def|class|for|while|if|elif|else|try|except|finally|with|return|raise|print)\b|[A-Za-z_]\w*(?:\[[^\]]*\])?\s*=|#|\s{4}\S)/.test(
          line,
        );
      const previous = blocks.at(-1);
      if (previous && previous.code === code) previous.text += "\n" + line;
      else blocks.push({ code, text: line });
    }
  }
  return blocks;
}
