"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { ChangePasswordForm } from "@/components/auth/change-password-form";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordDialog({
  open,
  onClose,
}: ChangePasswordDialogProps) {
  const onCloseRef = useRef(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      aria-labelledby="change-password-title"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
    >
      <button
        aria-label="关闭修改密码窗口"
        className="fixed inset-0 bg-sky-950/30 backdrop-blur-[1px]"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <section className="relative my-auto w-full max-w-md rounded-2xl border border-sky-100 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-lg font-semibold text-slate-950"
              id="change-password-title"
            >
              修改密码
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              验证当前密码后设置新密码。
            </p>
          </div>
          <button
            aria-label="关闭"
            className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-sky-50 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ChangePasswordForm onCancel={onClose} />
      </section>
    </div>
  );
}
