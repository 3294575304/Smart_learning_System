import React, { type ReactNode } from "react";
import {
  CircleCheck,
  CircleDashed,
  CircleAlert,
  Info,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";
const tones = {
  neutral: { icon: CircleDashed, style: "bg-muted text-muted-foreground" },
  success: { icon: CircleCheck, style: "bg-success-soft text-success" },
  warning: { icon: TriangleAlert, style: "bg-warning-soft text-warning" },
  danger: { icon: CircleAlert, style: "bg-danger-soft text-destructive" },
  info: { icon: Info, style: "bg-brand-soft text-brand-strong" },
} satisfies Record<StatusTone, { icon: typeof Info; style: string }>;

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  const { icon: Icon, style } = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-xs leading-5 font-medium",
        style,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{children}</span>
    </span>
  );
}
