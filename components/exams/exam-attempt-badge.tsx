import { StatusChip } from "@/components/ui/status-chip";

export function ExamAttemptBadge({ remaining }: { remaining?: number }) {
  if (remaining === undefined) return null;
  return (
    <StatusChip tone={remaining > 0 ? "brand" : "neutral"}>
      {remaining > 0 ? `剩余 ${remaining} 次` : "无剩余机会"}
    </StatusChip>
  );
}
