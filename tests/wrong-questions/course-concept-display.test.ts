import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("课程推荐错题优先显示冻结的课程 Concept 中文名称", async () => {
  const service = await readFile(
    new URL("../../services/wrong-questions/service.ts", import.meta.url),
    "utf8",
  );

  assert.match(service, /conceptSnapshots:/u);
  assert.match(service, /resolvedNode: \{ select: \{ name: true \} \}/u);
  assert.match(service, /conceptSnapshots\.length/u);
  assert.match(service, /name: snapshot\.resolvedNode\.name/u);
  assert.match(service, /some: \{ conceptId: query\.knowledgePointId \}/u);
});
