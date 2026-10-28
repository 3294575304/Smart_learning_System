import React from "react";
import { ArrowLeft } from "lucide-react";
export function StudentBackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 rounded-xl border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-sky-200/60 transition-colors hover:border-sky-700 hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
    >
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </a>
  );
}
