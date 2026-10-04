"use client";

import Link, { useLinkStatus } from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

function LinkFeedback({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-2" aria-live="polite">
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowRight className="size-4" aria-hidden="true" />
      )}
      {pending ? "正在打开…" : label}
    </span>
  );
}
export function NotificationLink({
  href,
  label,
  children,
  className,
}: {
  href: string;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      prefetch={false}
      className={
        className ??
        "inline-flex rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-sky-600"
      }
    >
      {children}
      <LinkFeedback label={label} />
    </Link>
  );
}
