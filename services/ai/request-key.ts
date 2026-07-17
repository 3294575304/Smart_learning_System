import { createHash } from "node:crypto";

import type { StudentAnalysisInput } from "@/services/ai/schemas";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function createAnalysisRequestKey(
  input: StudentAnalysisInput,
  promptVersion: string,
): string {
  const canonical = JSON.stringify(stableValue({ promptVersion, input }));
  return `student:${createHash("sha256").update(canonical).digest("hex")}`;
}
