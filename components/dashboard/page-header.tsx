import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
  eyebrow?: string;
  variant?: "default" | "student";
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  variant = "default",
}: PageHeaderProps) {
  return (
    <header
      className={`flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${variant === "student" ? "border-b pb-3" : ""}`}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-brand-strong text-xs font-medium tracking-wide">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-foreground text-2xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-[26px]">
          {title}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
