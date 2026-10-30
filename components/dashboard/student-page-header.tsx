import type { ComponentProps } from "react";
import type { PageHeader } from "./page-header";
export function StudentPageHeader({
  title,
  description,
  actions,
  eyebrow,
}: ComponentProps<typeof PageHeader>) {
  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-sky-100 pb-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-medium text-sky-700">{eyebrow}</p>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
