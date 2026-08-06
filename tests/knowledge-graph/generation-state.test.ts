import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { presentKnowledgeGraphGeneration } from "@/components/courses/knowledge-graph-generation-state";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

const structure = {
  nodes: [],
  edges: [],
  warnings: [],
} as unknown as KnowledgeGraphStructure;

function generation(
  status: string,
  overrides: Partial<{
    progress: number;
    errorCode: string | null;
    errorMessage: string | null;
    structure: KnowledgeGraphStructure | null;
    aiEnhancementStatus: string;
    aiWarningCode: string | null;
    aiWarningMessage: string | null;
  }> = {},
) {
  return {
    status,
    progress: overrides.progress ?? 0,
    errorCode: overrides.errorCode ?? null,
    errorMessage: overrides.errorMessage ?? null,
    structure: overrides.structure ?? null,
    aiEnhancementStatus: overrides.aiEnhancementStatus ?? "SUCCEEDED",
    aiWarningCode: overrides.aiWarningCode ?? null,
    aiWarningMessage: overrides.aiWarningMessage ?? null,
  };
}

test("PENDING and RUNNING are generating states and never success", () => {
  for (const status of ["PENDING", "PROCESSING", "RUNNING"]) {
    const result = presentKnowledgeGraphGeneration(generation(status));
    assert.equal(result.kind, "generating");
    assert.doesNotMatch(result.message, /草稿已生成/u);
  }
});

test("a persisted deterministic draft with failed AI is reviewable with a warning", () => {
  const result = presentKnowledgeGraphGeneration(
    generation("SUCCEEDED", {
      structure,
      aiEnhancementStatus: "FAILED",
      aiWarningCode: "PROVIDER_TIMEOUT",
      aiWarningMessage: "AI 服务响应超时。",
    }),
  );
  assert.equal(result.kind, "warning");
  assert.match(result.message, /基础知识图谱草稿已生成/u);
  assert.match(result.message, /PROVIDER_TIMEOUT/u);
});

test("only SUCCEEDED with a persisted draft reports success", () => {
  assert.deepEqual(
    presentKnowledgeGraphGeneration(generation("SUCCEEDED", { structure })),
    { kind: "succeeded", message: "知识图谱草稿已生成，请审核后保存。" },
  );
  const missing = presentKnowledgeGraphGeneration(generation("SUCCEEDED"));
  assert.equal(missing.kind, "failed");
  assert.match(missing.message, /GRAPH_DRAFT_MISSING/u);
  assert.doesNotMatch(missing.message, /草稿已生成/u);
});

test("FAILED exposes the code with a safe message and cannot be success", () => {
  const result = presentKnowledgeGraphGeneration(
    generation("FAILED", {
      errorCode: "PROVIDER_ERROR",
      errorMessage: "AI 服务暂时不可用，请稍后重试。",
      structure,
    }),
  );
  assert.equal(result.kind, "failed");
  assert.match(result.message, /PROVIDER_ERROR/u);
  assert.match(result.message, /AI 服务暂时不可用/u);
  assert.doesNotMatch(result.message, /草稿已生成/u);
});

test("POST acceptance only shows the submitted message and resets stale UI state", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/knowledge-graph-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /知识图谱生成任务已提交，请稍候。/u);
  const generateBody = source.slice(
    source.indexOf("async function generate()"),
    source.indexOf("async function save()"),
  );
  assert.doesNotMatch(generateBody, /草稿已生成/u);
  assert.match(generateBody, /setNotice\(null\)/u);
  assert.match(generateBody, /setError\(null\)/u);
  assert.match(generateBody, /setGraph\(null\)/u);
  assert.match(source, /notice && !error/u);
});

test("backend terminal-state and degradation invariants are explicit", async () => {
  const source = await readFile(
    new URL("../../services/knowledge-graph/service.ts", import.meta.url),
    "utf8",
  );
  const enhancementSource = await readFile(
    new URL(
      "../../services/knowledge-graph/ai-enhancement.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /const saved = await prisma\.\$transaction/u);
  assert.match(source, /generatedStructureJson: json\(structure\)/u);
  assert.match(source, /runOptionalKnowledgeGraphAiEnhancement/u);
  assert.match(enhancementSource, /inference: \{ related: \[\] \}/u);
  assert.match(source, /aiEnhancementStatus: ai\.status/u);
  assert.match(source, /status: KnowledgeGraphStatus\.SUCCEEDED/u);
  assert.match(source, /failSuccessWriteForTest/u);
  assert.match(source, /status: KnowledgeGraphStatus\.FAILED/u);
  assert.match(source, /generatedStructureJson: Prisma\.JsonNull/u);
  assert.match(
    source,
    /const review =\s+draft\?\.status === KnowledgeGraphStatus\.SUCCEEDED/u,
  );
  assert.match(source, /createdAt: \{ gte: draft\.startedAt \}/u);
  assert.match(source, /knowledge-graph-succeeded-without-draft/u);
});
