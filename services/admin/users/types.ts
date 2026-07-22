import type { Role, UserStatus } from "@prisma/client";

export interface AdminUserRoleSummary {
  studentNo: string | null;
  teacherNo: string | null;
  taughtClassroomCount: number;
  classMembershipCount: number;
  submissionCount: number;
}

export interface AdminUserView {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  summary: AdminUserRoleSummary;
}

export interface AdminUserPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminUserListResult {
  items: AdminUserView[];
  pagination: AdminUserPagination;
}

export interface RoleBoundRecordCounts {
  taughtClassrooms: number;
  assignments: number;
  createdQuestions: number;
  classMemberships: number;
  submissions: number;
  wrongQuestions: number;
  knowledgeMasteries: number;
  personalizedRecommendations: number;
  aiTutoringRecords: number;
}
