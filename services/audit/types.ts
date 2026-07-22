import type { AuditAction, Role, UserStatus } from "@prisma/client";

export interface AuditRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditUserSnapshot {
  displayName: string;
  email: string;
  role: Role;
  status: UserStatus;
}

export interface AuditUserReference {
  id: string;
  displayName: string;
  email: string;
}

export interface AuditLogView {
  id: string;
  action: AuditAction;
  targetType: "USER";
  targetId: string;
  summary: string;
  beforeData: AuditUserSnapshot | null;
  afterData: AuditUserSnapshot | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  actor: AuditUserReference;
  target: AuditUserReference | null;
}

export interface AuditLogListResult {
  items: AuditLogView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
