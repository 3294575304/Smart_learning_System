"use client";

import React, { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal provides focus containment, Escape and background inertness. */
export function EditorDialog({
  open,
  title,
  busy = false,
  showCloseButton = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  showCloseButton?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      // Start at the summary heading, not at an off-screen action button.
      heading.current?.focus();
      dialog.scrollTop = 0;
    }
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-sky-100 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-sky-950/25 sm:p-6"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          ref={heading}
          tabIndex={-1}
          id={titleId}
          className="text-lg font-semibold outline-none"
        >
          {title}
        </h2>
        {showCloseButton && (
          <button
            aria-label="关闭弹窗"
            className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
