import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("教师图谱页面包含来源过期、进度、审核、发布、搜索与离页保护", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/knowledge-graph-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  for (const text of [
    "当前正式图谱来自旧正式大纲",
    "进度",
    "保存审核稿",
    "发布知识图谱",
    "搜索编码或名称",
    "beforeunload",
  ])
    assert.match(source, new RegExp(text, "u"));
});
