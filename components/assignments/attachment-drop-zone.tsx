"use client";

import type { ReactNode } from "react";

export function AttachmentDropZone({
  className,
  disabled,
  label,
  onFiles,
  children,
}: {
  className: string;
  disabled: boolean;
  label: string;
  onFiles: (files: File[]) => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={`min-w-0 ${className}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {children}
    </section>
  );
}
