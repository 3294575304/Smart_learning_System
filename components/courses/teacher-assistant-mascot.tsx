"use client";

import { useId } from "react";
import styles from "./teacher-assistant-mascot.module.css";

export function TeacherAssistantMascot({
  greeting = false,
}: {
  greeting?: boolean;
}) {
  const clipId = useId();
  return (
    <svg
      viewBox="0 0 72 72"
      className="size-11 shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="36" cy="36" r="33" />
        </clipPath>
      </defs>
      <circle cx="36" cy="36" r="33" fill="#f4effa" />
      <g clipPath={`url(#${clipId})`}>
        <path d="M12 75c0-28 48-28 48 0" fill="#8b72b5" />
        <path d="m28 52 8 8 8-8" fill="#fff" />
        <rect x="31" y="42" width="10" height="14" rx="4" fill="#edc9aa" />
        <g className={greeting ? styles.greeting : undefined}>
          <ellipse cx="36" cy="31" rx="17" ry="20" fill="#f8e1ca" />
          <path
            d="M19 31C12 6 53-1 54 31c-7-1-14-6-18-13-3 7-9 11-17 13Z"
            fill="#493b59"
          />
          <circle cx="30" cy="33" r="1.7" fill="#493b59" />
          <circle cx="42" cy="33" r="1.7" fill="#493b59" />
          <path
            d="M32 40q4 3 8 0"
            fill="none"
            stroke="#976c67"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}
