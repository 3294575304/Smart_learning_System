export type SystemHealthStatus =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "DISABLED" | "UNKNOWN";

export interface DatabaseHealth {
  status: Extract<SystemHealthStatus, "HEALTHY" | "DEGRADED" | "UNAVAILABLE">;
  responseTimeMs: number | null;
}

export interface AIHealth {
  status: SystemHealthStatus;
  configurationComplete: boolean;
  successfulExecutionsLast7Days: number;
  issueExecutionsLast7Days: number;
  successRateLast7Days: number | null;
  lastSuccessAt: string | null;
  lastIssueAt: string | null;
}

export interface SandboxHealth {
  status: SystemHealthStatus;
  configurationComplete: boolean;
  executorVersion: string | null;
  active: number | null;
  queued: number | null;
  maxConcurrency: number | null;
  maxQueueDepth: number | null;
}

export interface SystemHealthResult {
  status: Extract<SystemHealthStatus, "HEALTHY" | "DEGRADED" | "UNAVAILABLE">;
  checkedAt: string;
  database: DatabaseHealth;
  ai: AIHealth;
  sandbox: SandboxHealth;
  config: {
    platformName: string;
    maintenanceMode: boolean;
    aiAnalysisEnabled: boolean;
  };
  data: {
    activeAdminAvailable: boolean;
    stalePendingAITaskCount: number;
  };
}
