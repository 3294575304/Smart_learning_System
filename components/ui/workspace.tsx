import React, { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
  density = "standard",
  width = "standard",
}: {
  children: ReactNode;
  className?: string;
  density?: "standard" | "compact";
  width?: "standard" | "reading" | "wide";
}) {
  return (
    <section
      data-density={density}
      className={cn(
        "workspace-page mx-auto w-full max-w-7xl min-w-0 space-y-6",
        width === "reading"
          ? "max-w-4xl"
          : width === "wide"
            ? "max-w-none"
            : "",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionPanel({
  children,
  className,
  id,
  label,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  label?: string;
}) {
  return (
    <section
      id={id}
      aria-label={label}
      className={cn(
        "workspace-panel bg-card min-w-0 rounded-xl border p-4 sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Labels scope only; authorization and aggregation stay in the domain service. */
export function ScopeSummary({
  label = "当前范围",
  children,
  description,
}: {
  label?: string;
  children: ReactNode;
  description?: string;
}) {
  return (
    <div className="bg-muted rounded-lg border px-4 py-3">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="text-foreground mt-1 text-sm leading-6 font-medium break-words">
        {children}
      </p>
      {description ? (
        <p className="text-muted-foreground mt-1 text-xs leading-5">
          {description}
        </p>
      ) : null}
    </div>
  );
}
