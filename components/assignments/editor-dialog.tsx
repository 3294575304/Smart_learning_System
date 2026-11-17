"use client";

import React, { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal provides focus containment, Escape and background inertness. */
export function EditorDialog({
  open,
  title,
  busy = false,
  showCloseButton = false,
  placement = "center",
  dialogId,
  onClose,
  onAfterClose,
  children,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  showCloseButton?: boolean;
  placement?: "center" | "right";
  dialogId?: string;
  onClose: () => void;
  onAfterClose?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const isDrawer = placement === "right";
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
      id={dialogId}
      aria-labelledby={titleId}
      className={
        "overflow-y-auto overscroll-contain border-sky-100 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-sky-950/25 sm:p-6 " +
        (isDrawer
          ? "inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[min(100%,25rem)] border-l"
          : "m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl rounded-2xl border")
      }
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={onAfterClose}
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
            aria-label={isDrawer ? "收起答题卡" : "关闭弹窗"}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm text-slate-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
            {isDrawer && "收起"}
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
