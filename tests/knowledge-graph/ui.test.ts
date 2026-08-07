import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("教师图谱页面包含来源过期、进度、审核、发布、筛选与离页保护", async () => {
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
    "筛选节点类型",
    "筛选关系类型",
    "节点详情与审核",
    "关系审核与编辑",
    "发布前版本差异预览",
    "beforeunload",
  ])
    assert.match(source, new RegExp(text, "u"));
});

test("教师图谱提供可平移缩放的图形视图和文字图例", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/knowledge-graph-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /课程知识图谱，可拖动平移并使用按钮缩放/u);
  assert.match(source, /缩小图谱/u);
  assert.match(source, /放大图谱/u);
  assert.match(source, /重置图谱视图/u);
  assert.match(source, /PREREQUISITE/u);
  assert.match(source, /RELATED/u);
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

test("AI 增强后保存使用隐藏审核稿的最新修订号", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/knowledge-graph-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /latestReviewRevisionNumber: number/u);
  assert.match(
    source,
    /expectedRevisionNumber: state\.latestReviewRevisionNumber/u,
  );
});
