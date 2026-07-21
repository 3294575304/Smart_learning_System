import type { ComponentType, ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
}

export function StatCard({ label, value, hint, icon: Icon }: StatCardProps) {
  return (
    <article className="bg-card rounded-xl border p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {hint ? <p className="text-muted-foreground mt-3 text-xs">{hint}</p> : null}
    </article>
  );
}
