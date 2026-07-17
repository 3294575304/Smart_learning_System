import { studentAnalysisOutputSchema } from "@/services/ai/schemas";
import type { LearningAnalysisMetadata } from "@/services/ai/metadata";
import type { StudentAnalysisOutput } from "@/services/ai/schemas";

export type LearningAnalysisFetchResult =
  | {
      status: "success";
      analysis: StudentAnalysisOutput;
      metadata: LearningAnalysisMetadata | null;
    }
  | { status: "not_found" }
  | { status: "pending" }
  | { status: "failed"; message: string };

type FetchImplementation = typeof fetch;

function parseMetadata(headers: Headers): LearningAnalysisMetadata | null {
  const source = headers.get("X-Learning-Analysis-Source");
  const promptVersion = headers.get("X-Learning-Analysis-Prompt-Version");
  const generatedAt = headers.get("X-Learning-Analysis-Generated-At");
  const fallbackHeader = headers.get("X-Learning-Analysis-Fallback");
  if (
    (source !== "AI" && source !== "RULE") ||
    !promptVersion ||
    !generatedAt ||
    (fallbackHeader !== "true" && fallbackHeader !== "false") ||
    Number.isNaN(Date.parse(generatedAt))
  ) {
    return null;
  }
  const model = headers.get("X-Learning-Analysis-Model")?.trim() || null;
  return {
    source,
    model,
    promptVersion,
    generatedAt: new Date(generatedAt).toISOString(),
    fallback: fallbackHeader === "true",
  };
}

function failedMessage(status: number): string {
  if (status === 401) return "登录状态已失效，请重新登录";
  if (status === 403) return "当前账号无权查看该学情分析";
  if (status >= 500) return "学情分析服务暂时不可用，请稍后重试";
  return "暂时无法加载学情分析，请稍后重试";
}

async function requestLearningAnalysis(
  submissionId: string,
  method: "GET" | "POST",
  signal: AbortSignal | undefined,
  fetchImplementation: FetchImplementation,
): Promise<LearningAnalysisFetchResult> {
  try {
    const response = await fetchImplementation(
      `/api/student/submissions/${submissionId}/analysis`,
      { method, signal },
    );
    if (response.status === 404) return { status: "not_found" };
    if (response.status === 409) return { status: "pending" };
    if (!response.ok) {
      return { status: "failed", message: failedMessage(response.status) };
    }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") {
      return {
        status: "failed",
        message: "学情分析数据格式异常，请稍后重试",
      };
    }
    const envelope = body as { success?: unknown; data?: unknown };
    const parsed = studentAnalysisOutputSchema.safeParse(envelope.data);
    if (envelope.success !== true || !parsed.success) {
      return {
        status: "failed",
        message: "学情分析数据格式异常，请稍后重试",
      };
    }
    return {
      status: "success",
      analysis: parsed.data,
      metadata: parseMetadata(response.headers),
    };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { status: "failed", message: "请求已取消" };
    }
    return {
      status: "failed",
      message: "网络请求失败，请检查连接后重试",
    };
  }
}

export function getLearningAnalysis(
  submissionId: string,
  options: {
    signal?: AbortSignal;
    fetchImplementation?: FetchImplementation;
  } = {},
): Promise<LearningAnalysisFetchResult> {
  return requestLearningAnalysis(
    submissionId,
    "GET",
    options.signal,
    options.fetchImplementation ?? fetch,
  );
}

export function generateLearningAnalysis(
  submissionId: string,
  options: { fetchImplementation?: FetchImplementation } = {},
): Promise<LearningAnalysisFetchResult> {
  return requestLearningAnalysis(
    submissionId,
    "POST",
    undefined,
    options.fetchImplementation ?? fetch,
  );
}
