import type { AIRecordStatus } from "@prisma/client";

export interface LearningAnalysisMetadata {
  source: "AI" | "RULE";
  model: string | null;
  promptVersion: string;
  generatedAt: string;
  fallback: boolean;
}

interface AnalysisMetadataRecord {
  status: AIRecordStatus;
  model: string | null;
  promptVersion: string;
  fallbackUsed: boolean;
  completedAt: Date | null;
  updatedAt: Date;
}

export function createLearningAnalysisMetadata(
  record: AnalysisMetadataRecord,
): LearningAnalysisMetadata {
  const fallback = record.fallbackUsed || record.status === "FALLBACK";
  return {
    source: fallback ? "RULE" : "AI",
    model: fallback ? null : record.model,
    promptVersion: record.promptVersion,
    generatedAt: (record.completedAt ?? record.updatedAt).toISOString(),
    fallback,
  };
}

export function learningAnalysisMetadataHeaders(
  metadata: LearningAnalysisMetadata,
): HeadersInit {
  return {
    "X-Learning-Analysis-Source": metadata.source,
    "X-Learning-Analysis-Model": metadata.model ?? "",
    "X-Learning-Analysis-Prompt-Version": metadata.promptVersion,
    "X-Learning-Analysis-Generated-At": metadata.generatedAt,
    "X-Learning-Analysis-Fallback": String(metadata.fallback),
  };
}
