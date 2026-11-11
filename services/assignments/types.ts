import type {
  AssignmentStatus,
  ClassroomStatus,
  ExamSubmissionReason,
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
  category?: import("./category").AssignmentCategoryValue;
  categoryNeedsReview?: boolean;
  allowAttachments?: boolean;
  submissionTask?: {
    prompt: string;
    referenceAnswer: string;
    points: number;
    resourceFileIds?: string[];
  } | null;
  resourceFiles?: Array<{ id: string; name: string; sizeBytes: number }>;
  id: string;
  title: string;
  description: string;
  status: AssignmentStatus;
  /** 同一次多班级保存生成的作业共享该标识；单班作业为空。 */
  batchId?: string | null;
  classroom: { id: string; name: string; status: ClassroomStatus };
  totalPoints: number;
  allowResubmission: boolean;
  publishedAt: Date | null;
  dueAt: Date | null;
  questions: AssignmentQuestionInputView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface StudentAssignmentListItem {
  originalDueAt?: Date;
  makeupKind?: "MAKEUP" | "REDO" | null;
  canWrite?: boolean;
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
  historyOnly?: boolean;
  latestSubmissionStatus?: SubmissionStatus | null;
  latestPublishedScore?: number | null;
}

export interface StudentQuestionView {
  id: string;
  title: string;
  content: string;
  images?: Array<{ id: string; url: string }>;
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

export interface SubmittedAnswerView {
  assignmentQuestionId: string;
  title: string;
  content: string;
  images?: Array<{ id: string; url: string }>;
  type: QuestionType;
  sortOrder: number;
  studentAnswer: string;
}

export interface SubmissionResultView {
  examReceipt: {
    reason: ExamSubmissionReason | null;
    lastSavedAt: Date | null;
    answeredCount: number;
  } | null;
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
  submittedAnswers: SubmittedAnswerView[];
  attachments: Array<{
    id: string;
    assignmentQuestionId: string;
    originalName: string;
    sizeBytes: number;
  }>;
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
    images: Array<{ id: string; url: string }>;
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
    knowledgePoints: Array<{
      id: string;
      code: string;
      name: string;
    }>;
  }>;
}

export interface TeacherSubmissionListItem {
  gradingBlockedReason: string | null;
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
  objectiveMaxScore: number;
  objectiveCount: number;
  objectiveJudgedCount: number;
  objectiveCorrectCount: number;
  objectivePercentage: number | null;
  displayStatus: string;
  currentScore: number | null;
  maxScore: number;
  requiresManualReview: boolean;
}

export interface TeacherSubmissionListResult {
  totalSubmitted: number;
  assignment: {
    allowAttachments?: boolean;
    category?: import("./category").AssignmentCategoryValue;
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
  finalScore: number | null;
  options: Array<{ id: string; label: string; content: string }>;
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
  snapshotAt: number;
  isLatestEffective: boolean;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    submittedAt: Date | null;
    status: SubmissionStatus;
  }>;
  questions: Array<{
    id: string;
    title: string;
    content: string;
    type: QuestionType;
    sortOrder: number;
    maxScore: number;
    correctAnswer: string;
    explanation: string;
    options: Array<{ id: string; label: string; content: string }>;
    answer: TeacherSubmissionAnswerView | null;
  }>;

  canManageGrading: boolean;
  gradingBlockedReason: string | null;
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
    allowAttachments?: boolean;
    category?: import("./category").AssignmentCategoryValue;
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
