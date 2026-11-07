"use client";

import { Eye, EyeOff, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { requestAdminApi } from "@/components/admin/request-api";

export function EditSchoolAdminButton({
  admin,
}: {
  admin: { id: string; displayName: string; email: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    const result = await requestAdminApi<{ id: string }>(
      `/api/super-admin/admins/${encodeURIComponent(admin.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: form.get("displayName"),
          email: form.get("email"),
          ...(password ? { password, confirmPassword } : {}),
        }),
      },
    );
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setPasswordVisible(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setPasswordVisible(false);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-50"
        aria-label={`编辑管理员账号 ${admin.displayName}`}
      >
        <Pencil aria-hidden="true" className="size-3.5" />
        编辑
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setPasswordVisible(false);
              setOpen(false);
            }
          }}
        >
          <form
            aria-labelledby="edit-school-admin-title"
            aria-modal="true"
            className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl"
            noValidate
            onSubmit={save}
            role="dialog"
          >
            <div>
              <h2
                id="edit-school-admin-title"
                className="text-lg font-semibold"
              >
                编辑高校管理员
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                当前密码不可还原；设置新密码后会立即使该账号现有登录失效。
              </p>
            </div>
            <label className="block text-sm font-medium">
              管理员姓名
              <input
                name="displayName"
                defaultValue={admin.displayName}
                required
                minLength={2}
                maxLength={50}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm font-medium">
              登录邮箱
              <input
                name="email"
                type="email"
                defaultValue={admin.email ?? ""}
                required
                maxLength={254}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="relative">
                <label
                  htmlFor={`school-admin-password-${admin.id}`}
                  className="block text-sm font-medium"
                >
                  设置新密码（选填）
                </label>
                <input
                  id={`school-admin-password-${admin.id}`}
                  name="password"
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? "隐藏新密码" : "显示新密码"}
                  aria-pressed={passwordVisible}
                  className="absolute top-8 right-2 rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                  {passwordVisible ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </button>
              </div>
              <label className="block text-sm font-medium">
                确认新密码
                <input
                  name="confirmPassword"
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2"
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              新密码至少 8 位，并包含大小写字母和数字。密码保存后不可再次查看。
            </p>
            {error ? (
              <p
                className="rounded-md bg-red-50 p-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPasswordVisible(false);
                  setOpen(false);
                }}
                className="rounded-md border px-4 py-2 text-sm text-slate-600 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "正在保存…" : "保存修改"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
