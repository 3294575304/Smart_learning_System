import type {
  AIHealth,
  SystemHealthStatus,
} from "@/services/system-health/types";

export function deriveAIHealthStatus(
  successCount: number,
  issueCount: number,
): AIHealth["status"] {
  if (successCount === 0 && issueCount === 0) return "UNKNOWN";
  if (successCount === 0) return "UNAVAILABLE";
  if (issueCount > 0) return "DEGRADED";
  return "HEALTHY";
}

export function deriveOverallHealthStatus(input: {
  database: SystemHealthStatus;
  ai: SystemHealthStatus;
  sandbox?: SystemHealthStatus;
  activeAdminAvailable: boolean;
  stalePendingAITaskCount: number;
}): "HEALTHY" | "DEGRADED" | "UNAVAILABLE" {
  if (input.database === "UNAVAILABLE") return "UNAVAILABLE";
  if (
    input.database === "DEGRADED" ||
    input.ai === "DEGRADED" ||
    input.ai === "UNAVAILABLE" ||
    input.sandbox === "DEGRADED" ||
    input.sandbox === "UNAVAILABLE" ||
    !input.activeAdminAvailable ||
    input.stalePendingAITaskCount > 0
  ) {
    return "DEGRADED";
  }
  return "HEALTHY";
}
