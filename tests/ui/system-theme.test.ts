import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(target);
      return /\.(?:ts|tsx)$/u.test(entry.name) ? [target] : [];
    }),
  );
  return nested.flat();
}

test("全系统使用浅蓝浅绿主题且不再使用黑色主界面背景", async () => {
  const [globals, shell, files] = await Promise.all([
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../components/dashboard/dashboard-shell.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    Promise.all([sourceFiles("app"), sourceFiles("components")]).then((items) =>
      items.flat(),
    ),
  ]);

  assert.match(globals, /--primary: oklch\(0\.59 0\.16 235\)/u);
  assert.match(globals, /--secondary: oklch\(0\.955 0\.035 175\)/u);
  assert.match(shell, /from-sky-50\/80/u);
  assert.match(shell, /via-background/u);
  assert.match(shell, /to-emerald-50\/60/u);
  assert.match(shell, /from-sky-500 to-emerald-500/u);

  const forbiddenBackground =
    /\b(?:bg-black(?:\/\d+)?|bg-gray-(?:800|900)|bg-slate-(?:800|900|950))\b/u;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, forbiddenBackground, file);
  }
});
