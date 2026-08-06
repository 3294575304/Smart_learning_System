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
    "重试 AI 增强",
    "搜索编码或名称",
    "beforeunload",
  ])
    assert.match(source, new RegExp(text, "u"));
});

test("发布请求携带并发与大纲上下文且后端错误码可见", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/knowledge-graph-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    source,
    /expectedRevisionNumber: state\.review\.revisionNumber/u,
  );
  assert.match(source, /publishedSyllabusStructureId:/u);
  assert.match(source, /result\.code/u);
  assert.match(source, /await load\(true\)/u);
  assert.match(source, /setNotice\(`知识图谱第/u);
  assert.match(source, /warning && !error/u);
});
