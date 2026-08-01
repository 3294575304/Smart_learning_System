import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("教学大纲审核界面包含来源、保存、发布、脏状态和历史提示", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/course-syllabus-review-panel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /教学大纲解析与审核/u);
  assert.match(source, /第 \{ref\.page\} 页/u);
  assert.match(source, /保存审核稿/u);
  assert.match(source, /发布课程大纲结构/u);
  assert.match(source, /有未保存修改/u);
  assert.match(source, /beforeunload/u);
  assert.match(source, /当前正式版本来自旧教学大纲文件/u);
  assert.match(source, /不会生成知识图谱/u);
  assert.match(source, /历史解析稿与正式版本/u);
  assert.match(source, /解析失败/u);
});
