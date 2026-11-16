import { sandboxResourceUsageSchema } from "@/services/sandbox-executor/schemas";

export function studentCaseDetails(
  item: {
    id: string;
    resourceUsage: unknown;
    stdout: string | null;
    stderr: string | null;
  },
  firstPublicId: string | undefined,
  publicRun: boolean,
) {
  const usage = sandboxResourceUsageSchema.safeParse(item.resourceUsage);
  return {
    resourceUsage: usage.success ? usage.data : null,
    ...(publicRun && item.id === firstPublicId
      ? { stdout: item.stdout ?? "", stderr: item.stderr ?? "" }
      : {}),
  };
}
