import type {
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
  RecommendationSource,
  RecommendationStatus,
} from "@prisma/client";

export type RecentErrorType =
  "CONCEPT" | "CALCULATION" | "CARELESS" | "METHOD" | "UNKNOWN";

export interface KnowledgeMasteryInput {
  knowledgePointId: string;
  masteryScore: number;
}

export interface WeakKnowledgePointInput {
  knowledgePointId: string;
  severity: number;
}

export interface CandidateKnowledgePoint {
  id: string;
  name: string;
  isActive: boolean;
}

export interface RecommendationCandidate {
  id: string;
  creatorId: string;
  title: string;
  type: QuestionType;
  difficulty: number;
  visibility: QuestionVisibility;
  status: QuestionStatus;
  deletedAt: Date | null;
  tags: string[];
  knowledgePoints: CandidateKnowledgePoint[];
}

export interface TeacherPracticeScope {
  teacherId: string;
  candidateQuestionIds: string[];
  knowledgePointIds: string[];
  types: QuestionType[];
  tags: string[];
}

export interface RecommendationAlgorithmInput {
  studentId: string;
  weakKnowledgePoints: WeakKnowledgePointInput[];
  knowledgeMasteries: KnowledgeMasteryInput[];
  recentCompletedQuestionIds: string[];
  activeRecommendationQuestionIds: string[];
  recentErrorTypes: RecentErrorType[];
  recommendedDifficulty: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  teacherScope: TeacherPracticeScope;
  candidates: RecommendationCandidate[];
  limit: number;
}

export type RecommendationReasonCode =
  | "WEAK_KNOWLEDGE_POINT"
  | "LOW_MASTERY"
  | "DIFFICULTY_MATCH"
  | "FOUNDATION_AFTER_WRONG_STREAK"
  | "ADVANCED_AFTER_CORRECT_STREAK"
  | "RECENT_ERROR_PATTERN"
  | "TEACHER_SCOPE";

export type RecommendationExclusionReason =
  | "DUPLICATE_CANDIDATE"
  | "UNAVAILABLE"
  | "UNAUTHORIZED"
  | "OUTSIDE_TEACHER_SCOPE"
  | "RECENTLY_COMPLETED"
  | "ALREADY_RECOMMENDED"
  | "DIFFICULTY_MISMATCH";

export interface MatchedKnowledgePoint {
  id: string;
  name: string;
  masteryScore: number | null;
}

export interface RecommendationItem {
  rank: number;
  questionId: string;
  title: string;
  type: QuestionType;
  difficulty: number;
  score: number;
  primaryKnowledgePointId: string | null;
  matchedKnowledgePoints: MatchedKnowledgePoint[];
  reasonCodes: RecommendationReasonCode[];
  reason: string;
}

export interface RecommendationMetadata {
  requestedCount: number;
  returnedCount: number;
  excludedCounts: Record<RecommendationExclusionReason, number>;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  representedTypes: QuestionType[];
  relaxedConstraints: string[];
}

export interface RecommendationAlgorithmResult {
  items: RecommendationItem[];
  metadata: RecommendationMetadata;
}

export interface PersonalizedRecommendationResult extends RecommendationAlgorithmResult {
  cycleKey: string;
  studentId: string;
  targetDifficulty: number;
  source: RecommendationSource;
  generatedAt: Date;
  createdItemCount: number;
  expiresAt: Date;
}

export interface RecommendationKnowledgePointView {
  id: string;
  name: string;
}

export interface RecommendationListItemView {
  id: string;
  questionId: string;
  title: string;
  content: string;
  type: QuestionType;
  difficulty: number;
  knowledgePoints: RecommendationKnowledgePointView[];
  reason: string;
  status: RecommendationStatus;
  createdAt: string;
  expiresAt: string | null;
}

export interface RecommendationDetailView extends RecommendationListItemView {
  options: Array<{
    id: string;
    label: string;
    content: string;
    sortOrder: number;
  }>;
  startedAt: string | null;
  completedAt: string | null;
  practiceResult: RecommendationPracticeResultView | null;
}

export interface RecommendationPracticeAnswerResultView {
  questionId: string;
  title: string;
  studentAnswer: string;
  correctAnswer: string;
  explanation: string;
  recommendationReason: string;
  isCorrect: boolean;
  score: number;
  maxScore: number;
  responseTimeMs: number | null;
}

export interface RecommendationPracticeResultView {
  recommendationId: string;
  status: RecommendationStatus;
  completedAt: string;
  totalCount: number;
  correctCount: number;
  score: number;
  maxScore: number;
  percentage: number;
  answers: RecommendationPracticeAnswerResultView[];
}

export interface RecommendationListResult {
  items: RecommendationListItemView[];
  pagination: {
    limit: number;
    nextCursor: string | null;
  };
}

export interface RecommendationGenerationResult {
  cycleKey: string;
  studentId: string;
  targetDifficulty: number;
  source: RecommendationSource;
  generatedAt: string;
  items: RecommendationListItemView[];
  metadata: RecommendationMetadata;
}
