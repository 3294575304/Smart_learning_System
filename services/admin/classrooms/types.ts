import type { ClassroomStatus } from "@prisma/client";

export interface AdminClassroomView {
  id: string;
  name: string;
  description: string | null;
  status: ClassroomStatus;
  allowStudentLeave: boolean;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  teacher: {
    id: string;
    displayName: string | null;
    email: string | null;
  };
  activeStudentCount: number;
  assignmentCount: number;
  submissionCount: number;
}

export interface AdminClassroomListResult {
  items: AdminClassroomView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
