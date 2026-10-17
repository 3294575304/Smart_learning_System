"use client";

import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

/** Fixed parent URLs also work before hydration or when client routing fails. */
export function TeacherBackLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <a
      href={href}
      aria-busy={pending}
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-800 shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
      onClick={(event) => {
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey &&
          event.button === 0
        )
          setPending(true);
      }}
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <ArrowLeft aria-hidden="true" className="size-4" />
      )}
      <span>{children}</span>
      {pending && (
        <span role="status" className="sr-only">
          正在返回，请稍候
        </span>
      )}
    </a>
  );
}
