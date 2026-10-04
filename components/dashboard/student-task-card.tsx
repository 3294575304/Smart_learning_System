import { ArrowRight, CheckCircle2, type LucideIcon } from "lucide-react";
import Link from "next/link";

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
    <article
      className={`flex min-w-0 flex-col rounded-2xl border bg-white p-5 ${count > 0 ? "border-rose-200" : "border-sky-100"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Icon aria-hidden="true" className="h-5 w-5 text-sky-700" />
          {title}
        </h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${count > 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}
        >
          {count > 0 && (
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-rose-500"
            />
          )}
          {count} 项待处理
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-4 flex-1 border-t border-slate-100 pt-4">
        {items.length ? (
          <ul className="space-y-3">
            {items.slice(0, 2).map((item) => (
              <li key={item.id}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="line-clamp-2 text-sm font-medium text-sky-800 hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="line-clamp-2 text-sm font-medium">
                    {item.title}
                  </p>
                )}
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.detail}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            当前没有待处理事项
          </p>
        )}
        {count > 2 && (
          <p className="mt-3 text-xs text-slate-500">
            另有 {count - 2} 项，进入后查看全部
          </p>
        )}
      </div>
      <Link
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        href={href}
      >
        {action}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </article>
  );
}
