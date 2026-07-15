"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { logoutAction } from "@/app/actions/auth";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="hover:bg-accent rounded-md border px-3 py-2 text-sm disabled:opacity-60"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await logoutAction();
          if (result.success) {
            for (let index = localStorage.length - 1; index >= 0; index -= 1) {
              const key = localStorage.key(index);
              if (key?.startsWith("assignment-draft:")) {
                localStorage.removeItem(key);
              }
            }
          }
          router.push(result.success ? result.data.redirectTo : "/login");
          router.refresh();
        });
      }}
      type="button"
    >
      {isPending ? "退出中…" : "退出登录"}
    </button>
  );
}
