import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { FOCUS_RING } from "./ui-focus";

interface StudentTaskCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  count: number;
  href: string;
  action: string;
  items: Array<{ id: string; title: string; detail: string; href?: string }>;
}

export function StudentTaskCard({
  title,
  description,
  icon: Icon,
  count,
  href,
  action,
  items,
}: StudentTaskCardProps) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-neutral-300 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Icon aria-hidden="true" className="text-brand size-5" />
          {title}
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${count > 0 ? "bg-rose-50 text-rose-700" : "bg-neutral-100 text-neutral-500"}`}
        >
          {count > 0 && (
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-rose-600"
            />
          )}
          {count} 项待处理
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-neutral-500">{description}</p>
      <div className="mt-4 flex-1 border-t border-neutral-200 pt-4">
        {items.length ? (
          <ul className="space-y-3">
            {items.slice(0, 2).map((item) => (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="text-brand-strong line-clamp-2 text-sm font-medium hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="line-clamp-2 text-sm font-medium">
                    {item.title}
                  </p>
                )}
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  {item.detail}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-neutral-500">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            当前没有待处理事项
          </p>
        )}
        {count > 2 && (
          <p className="mt-3 text-xs text-neutral-500">
            另有 {count - 2} 项，进入后查看全部
          </p>
        )}
      </div>
      <Link
        className={`bg-brand hover:bg-brand-strong mt-5 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white transition-colors ${FOCUS_RING}`}
        href={href}
      >
        {action}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </article>
  );
}
