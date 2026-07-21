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
  answers: Array<{
    assignmentQuestionId: string;
    title: string;
    sortOrder: number;
    score: number | null;
    maxScore: number;
    isCorrect: boolean | null;
    gradingStatus: GradingStatus;
  }>;
}
