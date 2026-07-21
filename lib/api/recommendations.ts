import type {
  RecommendationDetailView,
  RecommendationGenerationResult,
} from "@/services/recommendations/types";
import type { RecommendationGenerationApiInput } from "@/services/recommendations/schemas";
import type { ActionResult } from "@/types/action-result";

export const RECOMMENDATIONS_API_PATH = "/api/recommendations";

export function recommendationDetailApiPath(recommendationId: string): string {
  return `${RECOMMENDATIONS_API_PATH}/${encodeURIComponent(recommendationId)}`;
}

export function recommendationStartApiPath(recommendationId: string): string {
  return `${recommendationDetailApiPath(recommendationId)}/start`;
}

interface RequestOptions {
  fetchImplementation?: typeof fetch;
}

function isApiEnvelope(value: unknown): value is {
  success: boolean;
  data?: unknown;
  error?: unknown;
  fieldErrors?: unknown;
} {
  return typeof value === "object" && value !== null && "success" in value;
}

async function requestRecommendationApi<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<ActionResult<T>> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  try {
    const response = await fetchImplementation(input, init);
    const body: unknown = await response.json();
    if (!isApiEnvelope(body)) {
      return {
        success: false,
        error: "推荐服务返回异常，请稍后重试",
        status: response.status,
      };
    }
    if (body.success === true && "data" in body) {
      return { success: true, data: body.data as T };
    }
    return {
      success: false,
      error:
        typeof body.error === "string"
          ? body.error
          : "推荐服务暂时不可用，请稍后重试",
      status: response.status,
      ...(typeof body.fieldErrors === "object" && body.fieldErrors !== null
        ? { fieldErrors: body.fieldErrors as Record<string, string[]> }
        : {}),
    };
  } catch {
    return {
      success: false,
      error: "网络连接异常，请稍后重试",
      status: 0,
    };
  }
}

export function generateRecommendations(
  input: RecommendationGenerationApiInput,
  options: RequestOptions = {},
): Promise<ActionResult<RecommendationGenerationResult>> {
  return requestRecommendationApi<RecommendationGenerationResult>(
    RECOMMENDATIONS_API_PATH,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    options,
  );
}

export function startRecommendationRequest(
  recommendationId: string,
  options: RequestOptions = {},
): Promise<ActionResult<RecommendationDetailView>> {
  return requestRecommendationApi<RecommendationDetailView>(
    recommendationStartApiPath(recommendationId),
    { method: "POST" },
    options,
  );
}
