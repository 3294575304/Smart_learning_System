"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { StudentAnalyticsLink } from "./student-analytics-link";

const linkClassName =
  "flex min-h-10 items-center rounded-md px-3 text-sm text-slate-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-700";

export function StudentRecordLinks({
  assignmentsHref,
  examsHref,
  triggerClassName,
}: {
  assignmentsHref: string;
  examsHref: string;
  triggerClassName: string;
}) {
  const disclosureRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const linksId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: Event) {
      if (
        event.target instanceof Node &&
        !disclosureRef.current?.contains(event.target)
      )
        setOpen(false);
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("focusin", closeFromOutside);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("focusin", closeFromOutside);
    };
  }, [open]);

  return (
    <div
      ref={disclosureRef}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={linksId}
        className={`${triggerClassName} cursor-pointer whitespace-nowrap`}
        onClick={() => setOpen((current) => !current)}
      >
        查看全部
        <ChevronDown
          className={`size-3.5 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <ul
        id={linksId}
        hidden={!open}
        className="absolute end-0 top-full z-10 mt-1 min-w-32 rounded-xl border border-slate-200 bg-white p-1 shadow-md"
      >
        <li>
          <StudentAnalyticsLink
            href={assignmentsHref}
            className={linkClassName}
          >
            全部作业
          </StudentAnalyticsLink>
        </li>
        <li>
          <StudentAnalyticsLink href={examsHref} className={linkClassName}>
            全部考试
          </StudentAnalyticsLink>
        </li>
      </ul>
    </div>
  );
}
