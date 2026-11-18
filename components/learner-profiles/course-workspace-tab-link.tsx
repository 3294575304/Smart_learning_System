"use client";

import Link, { useLinkStatus } from "next/link";
import React, { type ReactNode } from "react";
import { sectionTabClass } from "@/components/ui/section-tabs";

function PendingTabStatus() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" className="pointer-events-none absolute end-0 top-0">
      <span className="sr-only">加载中…</span>
      <span
        aria-hidden="true"
        className="border-brand me-0.5 mt-0.5 block size-2.5 rounded-full border border-e-transparent motion-safe:animate-spin"
      />
    </span>
  ) : null;
}

export function CourseWorkspaceTabLink({
  href,
  active,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  onNavigate?: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      onNavigate={
        onNavigate
          ? (event) => {
              event.preventDefault();
              onNavigate(href);
            }
          : undefined
      }
      aria-current={active ? "page" : undefined}
      className={`relative ${sectionTabClass(active)}`}
    >
      {children}
      <PendingTabStatus />
    </Link>
  );
}
