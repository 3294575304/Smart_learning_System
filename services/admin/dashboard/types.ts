import type {
  AIRecordStatus,
  AssignmentStatus,
  QuestionType,
  RecommendationSource,
  RecommendationStatus,
  Role,
  SubmissionStatus,
  UserStatus,
} from "@prisma/client";

export const DASHBOARD_TIME_ZONE = "Asia/Shanghai";

export type DashboardRange = "7d" | "30d" | "90d";

export interface PeriodComparison {
  current: number;
  previous: number;
  difference: number;
  percentage: number | null;
  kind: "PERCENTAGE" | "NEW" | "NO_CHANGE";
}

export interface DashboardOverview {
  generatedAt: string;
  timeZone: typeof DASHBOARD_TIME_ZONE;
  users: {
    total: number;
    byRole: Record<Role, number>;
    byStatus: Record<UserStatus, number>;
    newLast7Days: number;
    newLast30Days: number;
    newUserComparison: PeriodComparison;
  };
  teaching: {
    classroomTotal: number;
    activeClassroomCount: number;
    questionTotal: number;
    draftAssignmentCount: number;
    publishedAssignmentCount: number;
    closedAssignmentCount: number;
    effectiveSubmissionCount: number;
    gradedSubmissionCount: number;
    pendingReviewSubmissionCount: number;
  };
  learning: {
    finalizedSubmissionCount: number;
    averageGradedPercentage: number | null;
    answersLast7Days: number;
    answersLast30Days: number;
    incorrectAnswerCount: number;
    generatedAnalysisCount: number;
    generatedRecommendationCount: number;
  };
  ai: {
    executionRecordCount: number;
    analysisRecordCount: number;
    recommendationRecordCount: number;
    executionsLast7Days: number;
    succeededCount: number;
    failedCount: number;
    fallbackCount: number;
    pendingCount: number;
    successRate: number | null;
    averageLatencyMs: number | null;
  };
  config: {
    platformName: string;
    maintenanceMode: boolean;
    aiAnalysisEnabled: boolean;
  };
}

export interface TrendPoint {
  date: string;
  users: number;
  assignments: number;
  submissions: number;
  answers: number;
  analyses: number;
  recommendations: number;
}

export interface DashboardTrends {
  range: DashboardRange;
  startDate: string;
  endDate: string;
  timeZone: typeof DASHBOARD_TIME_ZONE;
  points: TrendPoint[];
}

export interface DistributionItem<T extends string | number = string> {
  key: T;
  count: number;
}

export interface DashboardDistributions {
  generatedAt: string;
  roles: DistributionItem<Role>[];
  userStatuses: DistributionItem<UserStatus>[];
  questionTypes: DistributionItem<QuestionType>[];
  questionDifficulties: DistributionItem<number>[];
  assignmentStatuses: DistributionItem<AssignmentStatus>[];
  submissionStatuses: DistributionItem<SubmissionStatus>[];
  recommendationStatuses: DistributionItem<RecommendationStatus>[];
  recommendationSources: DistributionItem<RecommendationSource>[];
  knowledgePointCoverage: Array<{
    id: string;
    name: string;
    questionCount: number;
  }>;
}

export const dashboardActivityTypes = [
  "ALL",
  "USER_CREATED",
  "ASSIGNMENT_PUBLISHED",
  "ANALYSIS_GENERATED",
  "RECOMMENDATION_GENERATED",
  "ADMIN_AUDIT",
  "AI_FAILURE",
] as const;

export type DashboardActivityType = (typeof dashboardActivityTypes)[number];

export interface DashboardActivity {
  id: string;
  type: Exclude<DashboardActivityType, "ALL">;
  summary: string;
  occurredAt: string;
  href: string | null;
}

export interface DashboardActivities {
  items: DashboardActivity[];
  limit: number;
}

export interface AIStatusCount {
  status: AIRecordStatus;
  count: number;
}
