import type { AuditRequestContext } from "@/services/audit/types";

function safeHeader(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

export function auditRequestContext(request: Request): AuditRequestContext {
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  return {
    ipAddress: safeHeader(forwarded ?? request.headers.get("x-real-ip"), 255),
    userAgent: safeHeader(request.headers.get("user-agent"), 512),
  };
}
