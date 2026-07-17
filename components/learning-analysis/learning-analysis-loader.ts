import {
  generateLearningAnalysis,
  getLearningAnalysis,
  type LearningAnalysisFetchResult,
} from "@/lib/api/learning-analysis";

export interface LearningAnalysisRequests {
  get: typeof getLearningAnalysis;
  generate: typeof generateLearningAnalysis;
}

const inFlightGenerations = new Map<
  string,
  Promise<LearningAnalysisFetchResult>
>();

function generateOnce(
  submissionId: string,
  requests: LearningAnalysisRequests,
): Promise<LearningAnalysisFetchResult> {
  const existing = inFlightGenerations.get(submissionId);
  if (existing) return existing;
  const request = requests.generate(submissionId).finally(() => {
    if (inFlightGenerations.get(submissionId) === request) {
      inFlightGenerations.delete(submissionId);
    }
  });
  inFlightGenerations.set(submissionId, request);
  return request;
}

export async function loadLearningAnalysis(
  submissionId: string,
  signal?: AbortSignal,
  requests: LearningAnalysisRequests = {
    get: getLearningAnalysis,
    generate: generateLearningAnalysis,
  },
  onGenerating?: () => void,
): Promise<LearningAnalysisFetchResult> {
  const existing = await requests.get(submissionId, { signal });
  if (existing.status !== "not_found") return existing;
  if (signal?.aborted) {
    return { status: "failed", message: "请求已取消" };
  }
  onGenerating?.();
  return generateOnce(submissionId, requests);
}
