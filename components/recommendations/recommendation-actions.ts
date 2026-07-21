import type { RecommendationGenerationApiInput } from "@/services/recommendations/schemas";
import type {
  RecommendationDetailView,
  RecommendationGenerationResult,
} from "@/services/recommendations/types";
import type { ActionResult } from "@/types/action-result";

export interface RecommendationActionFeedback {
  kind: "success" | "error";
  message: string;
}

interface GenerateDependencies {
  generate: (
    input: RecommendationGenerationApiInput,
  ) => Promise<ActionResult<RecommendationGenerationResult>>;
  refresh: () => void;
}

interface StartDependencies {
  start: (
    recommendationId: string,
  ) => Promise<ActionResult<RecommendationDetailView>>;
  navigate: (path: string) => void;
  refresh: () => void;
}

export function recommendationPracticePath(recommendationId: string): string {
  return `/student/recommendations/${encodeURIComponent(recommendationId)}/practice`;
}

export async function runGenerateRecommendations(
  input: RecommendationGenerationApiInput,
  dependencies: GenerateDependencies,
): Promise<RecommendationActionFeedback> {
  const result = await dependencies.generate(input);
  if (!result.success) {
    return {
      kind: "error",
      message:
        result.status === 422
          ? "暂时没有足够的数据或可用题目生成推荐，请先完成一些作业后再试。"
          : result.error,
    };
  }
  dependencies.refresh();
  return {
    kind: "success",
    message: `已生成 ${result.data.items.length} 道推荐练习。`,
  };
}

export async function runStartRecommendation(
  recommendationId: string,
  dependencies: StartDependencies,
): Promise<RecommendationActionFeedback> {
  const result = await dependencies.start(recommendationId);
  if (!result.success) {
    return {
      kind: "error",
      message:
        result.status === 409
          ? "这条推荐已失效或状态发生变化，请刷新列表后重试。"
          : result.error,
    };
  }
  dependencies.navigate(recommendationPracticePath(recommendationId));
  dependencies.refresh();
  return { kind: "success", message: "练习已开始。" };
}
