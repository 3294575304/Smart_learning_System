import type { ComponentType, ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
}

export function StatCard({ label, value, hint, icon: Icon }: StatCardProps) {
  return (
    <article className="bg-card rounded-xl border border-sky-100 p-5 shadow-sm shadow-sky-100/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-50 to-emerald-50 text-sky-700 ring-1 ring-sky-100">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {hint ? (
        <p className="text-muted-foreground mt-3 text-xs">{hint}</p>
      ) : null}
    </article>
  );
}
