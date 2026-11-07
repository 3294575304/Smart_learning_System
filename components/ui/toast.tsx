"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const DURATION_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  error: 6000,
};

let nextId = 1;
let current: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  const snapshot = [...current];
  for (const listener of listeners) listener(snapshot);
}

export function dismissToast(id: number) {
  current = current.filter((item) => item.id !== id);
  emit();
}

/** 全局弹出提示：在事件处理或副作用中直接调用，无需在组件间传递状态。 */
export function toast(kind: ToastKind, message: string) {
  const id = nextId++;
  current = [...current, { id, kind, message }];
  emit();
  window.setTimeout(() => dismissToast(id), DURATION_MS[kind]);
  return id;
}

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const KIND_CLASS: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

const ICON_CLASS: Record<ToastKind, string> = {
  success: "text-emerald-600",
  error: "text-red-600",
  info: "text-sky-600",
};

/** 单例宿主：挂载一次即可（通常放在布局里）。 */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>(current);

  useEffect(() => {
    const listener = (next: ToastItem[]) => setItems(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
    >
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${KIND_CLASS[item.kind]}`}
            style={{ animation: "toast-in 160ms ease-out" }}
          >
            <Icon
              aria-hidden="true"
              className={`mt-0.5 size-5 shrink-0 ${ICON_CLASS[item.kind]}`}
            />
            <p className="min-w-0 flex-1 leading-6 break-words">
              {item.message}
            </p>
            <button
              type="button"
              aria-label="关闭提示"
              className="shrink-0 rounded p-0.5 opacity-50 transition hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => dismissToast(item.id)}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
