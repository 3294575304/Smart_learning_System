import type { LearningAnalysisMetadata } from "@/services/ai/metadata";
import type { StudentAnalysisOutput } from "@/services/ai/schemas";

export type LearningAnalysis = StudentAnalysisOutput;
export type { LearningAnalysisMetadata };

export const LOW_CONFIDENCE_THRESHOLD = 0.6;
