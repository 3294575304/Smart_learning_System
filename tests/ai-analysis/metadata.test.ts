import assert from "node:assert/strict";
import test from "node:test";
import { AIRecordStatus } from "@prisma/client";

import {
  createLearningAnalysisMetadata,
  learningAnalysisMetadataHeaders,
} from "../../services/ai/metadata";

test("AI metadata uses the stored model, prompt version, and completion time", () => {
  const metadata = createLearningAnalysisMetadata({
    status: AIRecordStatus.SUCCEEDED,
    model: "stored-model",
    promptVersion: "student-analysis-v1",
    fallbackUsed: false,
    completedAt: new Date("2026-07-17T10:00:00.000Z"),
    updatedAt: new Date("2026-07-17T10:01:00.000Z"),
  });
  assert.deepEqual(metadata, {
    source: "AI",
    model: "stored-model",
    promptVersion: "student-analysis-v1",
    generatedAt: "2026-07-17T10:00:00.000Z",
    fallback: false,
  });
});

test("fallback metadata is clearly marked as rule analysis", () => {
  const metadata = createLearningAnalysisMetadata({
    status: AIRecordStatus.FALLBACK,
    model: "rule-fallback-v1",
    promptVersion: "student-analysis-v1",
    fallbackUsed: true,
    completedAt: null,
    updatedAt: new Date("2026-07-17T10:02:00.000Z"),
  });
  assert.equal(metadata.source, "RULE");
  assert.equal(metadata.model, null);
  assert.equal(metadata.fallback, true);
  assert.equal(metadata.generatedAt, "2026-07-17T10:02:00.000Z");
});

test("metadata headers contain only public provenance fields", () => {
  const headers = learningAnalysisMetadataHeaders({
    source: "AI",
    model: "stored-model",
    promptVersion: "student-analysis-v1",
    generatedAt: "2026-07-17T10:00:00.000Z",
    fallback: false,
  });
  const serialized = JSON.stringify(headers);
  assert.doesNotMatch(
    serialized,
    /api.?key|prompt text|student answer|raw response/iu,
  );
  assert.deepEqual(Object.keys(headers).sort(), [
    "X-Learning-Analysis-Fallback",
    "X-Learning-Analysis-Generated-At",
    "X-Learning-Analysis-Model",
    "X-Learning-Analysis-Prompt-Version",
    "X-Learning-Analysis-Source",
  ]);
});
