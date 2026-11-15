"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  children,
  busy,
  onCancel,
  onConfirm,
  confirmLabel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      dialog.close();
      return;
    }
    const trigger = document.activeElement;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="bg-popover text-popover-foreground backdrop:bg-foreground/30 fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border p-5 shadow-xl"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      <div
        id={bodyId}
        className="text-muted-foreground mt-3 space-y-3 text-sm leading-6"
      >
        {children}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="min-h-11 rounded-lg border px-4 text-sm disabled:opacity-50"
        >
          返回核对
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="bg-brand hover:bg-brand-strong min-h-11 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "正在生成正式版…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
