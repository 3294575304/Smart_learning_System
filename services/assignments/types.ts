import type {
  AssignmentStatus,
  GradingStatus,
  QuestionType,
  SubmissionStatus,
} from "@prisma/client";

export interface AssignmentQuestionInputView {
  id: string;
  questionId: string;
  title: string;
  type: QuestionType;
  sortOrder: number;
  points: number;
}

export interface TeacherAssignmentView {
  id: string;
  title: string;
  description: string;
  status: AssignmentStatus;
  classroom: { id: string; name: string };
  totalPoints: number;
  allowResubmission: boolean;
  publishedAt: Date | null;
  dueAt: Date | null;
  questions: AssignmentQuestionInputView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentAssignmentListItem {
  id: string;
  title: string;
  description: string;
  classroomName: string;
  totalPoints: number;
  questionCount: number;
  publishedAt: Date;
  dueAt: Date;
  allowResubmission: boolean;
  attemptCount: number;
  inProgressSubmissionId: string | null;
  latestSubmissionId: string | null;
}

export interface StudentQuestionView {
  id: string;
  title: string;
  content: string;
  type: QuestionType;
  sortOrder: number;
  points: number;
  options: Array<{
    id: string;
    label: string;
    content: string;
    sortOrder: number;
  }>;
}

export interface SubmissionResultView {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  attemptNumber: number;
  status: SubmissionStatus;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  isPublished: boolean;
  programmingAttempts: Array<{
    id: string;
    assignmentQuestionId: string;
    status: string;
  }>;
  answers: Array<{
    id: string;
    assignmentQuestionId: string;
    title: string;
    content: string;
    type: QuestionType;
    sortOrder: number;
    score: number | null;
    maxScore: number;
    isCorrect: boolean | null;
    gradingStatus: GradingStatus;
    studentAnswer: string;
    correctAnswer: string;
    explanation: string;
    teacherFeedback: string | null;
  }>;
}

export interface TeacherSubmissionListItem {
  id: string;
  student: {
    id: string;
    displayName: string | null;
    email: string | null;
    studentNo: string | null;
  };
  attemptNumber: number;
  status: SubmissionStatus;
  submittedAt: Date | null;
  gradedAt: Date | null;
  publishedAt: Date | null;
  objectiveScore: number;
  currentScore: number | null;
  maxScore: number;
  requiresManualReview: boolean;
}

export interface TeacherSubmissionListResult {
  assignment: {
    id: string;
    title: string;
    classroomName: string;
    totalPoints: number;
  };
  items: TeacherSubmissionListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface TeacherSubmissionAnswerView {
  id: string;
  assignmentQuestionId: string;
  title: string;
  content: string;
  type: QuestionType;
  sortOrder: number;
  maxScore: number;
  studentAnswer: string;
  correctAnswer: string;
  automaticScore: number | null;
  manualScore: number | null;
  isCorrect: boolean | null;
  gradingStatus: GradingStatus;
  teacherFeedback: string | null;
  explanation: string;
  programmingAttempt: {
    id: string;
    status: string;
    score: number | null;
    maxScore: number;
    errorType: string | null;
    safeErrorSummary: string | null;
    revisionNumber: number;
  } | null;
}

export interface TeacherSubmissionDetail {
  id: string;
  status: SubmissionStatus;
  attemptNumber: number;
  submittedAt: Date | null;
  gradedAt: Date | null;
  publishedAt: Date | null;
  score: number | null;
  maxScore: number;
  percentage: number | null;
  assignment: {
    id: string;
    title: string;
    classroomId: string;
    classroomName: string;
    totalPoints: number;
  };
  student: {
    id: string;
    displayName: string | null;
    email: string | null;
    studentNo: string | null;
  };
  answers: TeacherSubmissionAnswerView[];
}

export interface PublishAssignmentResultsResult {
  assignmentId: string;
  status: "PUBLISHED";
  publishedCount: number;
  alreadyPublishedCount: number;
  publishedAt: Date | null;
}
