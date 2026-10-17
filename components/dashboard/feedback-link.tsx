"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Eye,
  GraduationCap,
  LoaderCircle,
  Sparkles,
} from "lucide-react";

const icons = {
  tasks: ClipboardList,
  analytics: BarChart3,
  grades: GraduationCap,
  practice: Sparkles,
  detail: Eye,
};

function Content({
  label,
  icon,
  arrow,
}: {
  label: string;
  icon?: keyof typeof icons;
  arrow: boolean;
}) {
  const { pending } = useLinkStatus();
  const Icon = icon ? icons[icon] : null;
  return (
    <>
      {pending ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin"
        />
      ) : Icon ? (
        <Icon aria-hidden="true" className="size-4 shrink-0" />
      ) : null}
      <span aria-live="polite">{pending ? "正在打开…" : label}</span>
      {arrow && !pending ? (
        <ArrowRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
        />
      ) : null}
    </>
  );
}

/** Prefetch on intent instead of eagerly loading every long result page. */
export function FeedbackLink({
  href,
  label,
  icon,
  arrow = true,
  className,
  current,
  ariaLabel,
}: {
  href: string;
  label: string;
  icon?: keyof typeof icons;
  arrow?: boolean;
  className?: string;
  current?: boolean;
  ariaLabel?: string;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      aria-current={current ? "page" : undefined}
      aria-label={ariaLabel}
      className={
        className ??
        "group inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 transition hover:border-sky-300 hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none sm:text-sm"
      }
    >
      <Content label={label} icon={icon} arrow={arrow} />
    </Link>
  );
}
