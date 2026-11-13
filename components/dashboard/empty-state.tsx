import React, { type ComponentType, type ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`bg-card flex min-w-0 flex-col items-center justify-center rounded-xl border border-dashed text-center ${compact ? "p-6" : "px-4 py-10 sm:px-10"}`}
    >
      <span className="bg-muted text-muted-foreground flex h-11 w-11 items-center justify-center rounded-lg">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
