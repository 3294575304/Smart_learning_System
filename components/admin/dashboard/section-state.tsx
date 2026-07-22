import { AlertTriangle, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function DashboardPanel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border p-5 shadow-sm shadow-black/[0.02]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {description}
          </p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SectionLoading({
  label = "正在读取真实数据",
}: {
  label?: string;
}) {
  return (
    <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 rounded-lg border border-dashed text-sm">
      <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function SectionError({ message }: { message: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-6 text-center text-sm text-red-800">
      <span>
        <AlertTriangle aria-hidden="true" className="mx-auto mb-2 h-5 w-5" />
        {message}
      </span>
    </div>
  );
}

export function SectionEmpty({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex min-h-40 items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm">
      {message}
    </div>
  );
}
