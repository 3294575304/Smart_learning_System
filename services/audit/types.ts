import type {
  AuditAction,
  AuditTargetType,
  Role,
  UserStatus,
} from "@prisma/client";

export interface AuditRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditUserSnapshot {
  displayName: string | null;
  email: string | null;
  role: Role;
  status: UserStatus;
}

export type AuditConfigValue = string | number | boolean | null;
export type AuditConfigSnapshot = Record<string, AuditConfigValue>;
export type AuditSnapshot = AuditUserSnapshot | AuditConfigSnapshot;

export interface AuditUserReference {
  id: string;
  displayName: string | null;
  email: string | null;
}

export interface AuditLogView {
  id: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  summary: string;
  beforeData: AuditSnapshot | null;
  afterData: AuditSnapshot | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  actor: AuditUserReference;
  target: AuditUserReference | null;
  targetLabel: string;
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
