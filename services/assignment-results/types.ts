import type {
  AssignmentStatus,
  GradingStatus,
  QuestionType,
  SubmissionStatus,
} from "@prisma/client";

export interface TeacherResultOverviewItem {
  id: string;
  title: string;
  status: AssignmentStatus;
  classroom: { id: string; name: string };
  dueAt: Date | null;
  studentCount: number;
  submittedCount: number;
  pendingReviewCount: number;
  averageScore: number | null;
  averagePercentage: number | null;
  highestScore: number | null;
  lowestScore: number | null;
}

export interface TeacherResultsOverview {
  items: TeacherResultOverviewItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ScoreSummary {
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  finalizedCount: number;
  submittedCount: number;
  unsubmittedCount: number;
  studentCount: number;
}

export interface DistributionBucket {
  key: "0-59" | "60-69" | "70-79" | "80-89" | "90-100";
  label: string;
  count: number;
}

export interface QuestionAccuracy {
  assignmentQuestionId: string;
  sortOrder: number;
  title: string;
  points: number;
  judgedCount: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number | null;
}

export interface KnowledgePointAccuracy {
  knowledgePointId: string;
  code: string;
  name: string;
  judgedWeight: number;
  correctWeight: number;
  accuracy: number | null;
}

export interface StudentScoreRow {
  studentId: string;
  displayName: string;
  email: string;
  studentNo: string | null;
  submissionId: string | null;
  attemptNumber: number | null;
  status: SubmissionStatus | null;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
}

export interface StudentAttemptSummary {
  id: string;
  attemptNumber: number;
  status: SubmissionStatus;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
}

export interface StudentAnswerDetail {
  id: string;
  assignmentQuestionId: string;
  sortOrder: number;
  title: string;
  content: string;
  type: QuestionType;
  points: number;
  studentAnswer: string;
  correctAnswer: string;
  score: number | null;
  maxScore: number;
  isCorrect: boolean | null;
  gradingStatus: GradingStatus;
  teacherFeedback: string | null;
  knowledgePoints: string[];
}

export interface SelectedStudentDetail {
  student: {
    id: string;
    displayName: string;
    email: string;
    studentNo: string | null;
  };
  attempts: StudentAttemptSummary[];
  selectedSubmission: StudentAttemptSummary | null;
  answers: StudentAnswerDetail[];
}

export interface AssignmentResultsView {
  assignment: {
    id: string;
    title: string;
    status: AssignmentStatus;
    totalPoints: number;
    classroom: { id: string; name: string };
  };
  summary: ScoreSummary;
  distribution: DistributionBucket[];
  questionAccuracy: QuestionAccuracy[];
  knowledgePointAccuracy: KnowledgePointAccuracy[];
  frequentWrongQuestions: QuestionAccuracy[];
  students: {
    items: StudentScoreRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  selectedStudent: SelectedStudentDetail | null;
}
