import type { ComponentProps, ReactNode } from "react";

/**
 * growth 四页共享的三件基础件。
 * 只负责容器与排版节奏，不引入新的设计系统：
 * 卡片 p-5 / 卡间 gap-4 / 标题与内容 mt-3。
 */
export function Panel({
  className,
  children,
  ...rest
}: ComponentProps<"section">) {
  return (
    <section
      className={`border-line bg-card min-w-0 rounded-xl border p-5 ${className ?? ""}`}
      {...rest}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  title,
  description,
  icon,
  actions,
  level = "card",
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** page：页面级区块（18px）；card：卡片内小节（15px）。 */
  level?: "page" | "card";
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon}
          <h2
            className={`text-ink font-semibold ${
              level === "page" ? "text-[18px]" : "text-[15px]"
            }`}
            id={id}
          >
            {title}
          </h2>
        </div>
        {description ? (
          <p className="text-ink-soft mt-1 max-w-[60ch] text-sm leading-6">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  unit,
  detail,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
  tone?: "default" | "muted" | "subjective";
}) {
  const surface =
    tone === "subjective"
      ? "border-amber-200 bg-amber-50/60"
      : tone === "muted"
        ? "border-line bg-muted/40"
        : "border-line bg-card";
  return (
    <div className={`min-w-0 rounded-lg border p-3 ${surface}`}>
      <p className="text-ink-soft text-xs">{label}</p>
      <p className="text-ink mt-1.5 flex items-baseline gap-1 text-[20px] leading-none font-semibold tabular-nums">
        {value}
        {unit ? (
          <span className="text-ink-soft text-xs font-medium">{unit}</span>
        ) : null}
      </p>
      {detail ? (
        <p className="text-ink-soft mt-2 text-xs leading-5">{detail}</p>
      ) : null}
    </div>
  );
}
