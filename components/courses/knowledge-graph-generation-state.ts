import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";

export type KnowledgeGraphGenerationStatus =
  "PENDING" | "PROCESSING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface KnowledgeGraphGenerationSnapshot {
  status: KnowledgeGraphGenerationStatus | string;
  progress: number;
  errorCode: string | null;
  errorMessage: string | null;
  aiEnhancementStatus?: string;
  aiWarningCode?: string | null;
  aiWarningMessage?: string | null;
  structure: KnowledgeGraphStructure | null;
}

export type KnowledgeGraphGenerationPresentation =
  | { kind: "idle" }
  | { kind: "generating"; message: string }
  | { kind: "succeeded"; message: string }
  | { kind: "warning"; message: string }
  | { kind: "failed"; message: string };

const safeGenerationErrors: Record<string, string> = {
  PROVIDER_ERROR: "AI 服务暂时不可用，请稍后重试。",
  PROVIDER_TIMEOUT: "AI 服务响应超时，请稍后重试。",
  PROVIDER_UNSUPPORTED: "当前 AI 服务不支持知识图谱生成。",
  INVALID_PROVIDER_OUTPUT: "AI 服务返回的数据格式无效，请重试或联系管理员。",
  PUBLISHED_SYLLABUS_REQUIRED: "请先审核并发布正式教学大纲。",
  GRAPH_GENERATION_FAILED: "知识图谱生成失败，请稍后重试。",
  GRAPH_DRAFT_MISSING: "生成任务已结束，但未找到有效草稿，请重试。",
};

export function safeKnowledgeGraphGenerationError(
  errorCode: string | null,
  serverMessage: string | null,
) {
  const code = errorCode ?? "GRAPH_GENERATION_FAILED";
  return `${code}：${safeGenerationErrors[code] ?? serverMessage ?? "知识图谱生成失败，请稍后重试。"}`;
}

export function presentKnowledgeGraphGeneration(
  generation: KnowledgeGraphGenerationSnapshot | null,
): KnowledgeGraphGenerationPresentation {
  if (!generation) return { kind: "idle" };
  if (
    generation.status === "PENDING" ||
    generation.status === "PROCESSING" ||
    generation.status === "RUNNING"
  )
    return {
      kind: "generating",
      message: `知识图谱生成中，进度 ${generation.progress}%`,
    };
  if (generation.status === "FAILED")
    return {
      kind: "failed",
      message: safeKnowledgeGraphGenerationError(
        generation.errorCode,
        generation.errorMessage,
      ),
    };
  if (generation.status === "SUCCEEDED")
    return generation.structure
      ? generation.aiEnhancementStatus === "FAILED"
        ? {
            kind: "warning",
            message:
              "基础知识图谱草稿已生成，但 AI RELATED 关系推断暂时不可用。当前草稿不包含 AI 建议关系，可审核后发布，也可稍后重试 AI 增强。" +
              (generation.aiWarningCode
                ? `（${generation.aiWarningCode}：${generation.aiWarningMessage ?? "请联系管理员查看服务端诊断。"}）`
                : ""),
          }
        : { kind: "succeeded", message: "知识图谱草稿已生成，请审核后保存。" }
      : {
          kind: "failed",
          message: safeKnowledgeGraphGenerationError(
            "GRAPH_DRAFT_MISSING",
            null,
          ),
        };
  return { kind: "idle" };
}
