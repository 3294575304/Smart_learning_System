import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export interface SystemDevelopmentLog {
  date: string;
  category: string;
  title: string;
  summary: string;
  details: readonly string[];
  verification?: string;
}

const ENTRY_HEADING = /^## (\d{4}-\d{2}-\d{2}) \| ([^|]+) \| (.+)$/gm;

function parseEntry(
  date: string,
  category: string,
  title: string,
  body: string,
) {
  const lines = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const summary = lines.find((line) => !line.startsWith("- "));
  if (!summary) return null;

  const details: string[] = [];
  let verification: string | undefined;
  for (const line of lines) {
    if (line.startsWith("- ")) details.push(line.slice(2).trim());
    else if (line.startsWith("验证：")) verification = line.slice(4).trim();
  }

  return {
    date,
    category: category.trim(),
    title: title.trim(),
    summary,
    details,
    ...(verification ? { verification } : {}),
  } satisfies SystemDevelopmentLog;
}

export async function getSystemDevelopmentLogs(): Promise<
  readonly SystemDevelopmentLog[]
> {
  const source = await readFile(
    path.join(process.cwd(), "CHANGELOG.md"),
    "utf8",
  );
  const headings = [...source.matchAll(ENTRY_HEADING)];
  const entries = headings.flatMap((heading, index) => {
    const date = heading[1];
    const category = heading[2];
    const title = heading[3];
    if (!date || !category || !title || heading.index === undefined) return [];
    const bodyStart = heading.index + heading[0].length;
    const bodyEnd = headings[index + 1]?.index ?? source.length;
    const entry = parseEntry(
      date,
      category,
      title,
      source.slice(bodyStart, bodyEnd),
    );
    return entry ? [entry] : [];
  });

  return entries.sort((left, right) => right.date.localeCompare(left.date));
}
