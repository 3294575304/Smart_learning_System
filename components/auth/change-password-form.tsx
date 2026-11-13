"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { changePasswordAction } from "@/app/actions/auth";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/services/auth/schemas";

const passwordFields = [
  "currentPassword",
  "password",
  "confirmPassword",
] as const;

function isPasswordField(
  field: string,
): field is (typeof passwordFields)[number] {
  return passwordFields.includes(field as (typeof passwordFields)[number]);
}

interface ChangePasswordFormProps {
  onCancel: () => void;
}

export function ChangePasswordForm({ onCancel }: ChangePasswordFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit((input) => {
    setServerError(null);
    startTransition(async () => {
      const result = await changePasswordAction(input);

      if (!result.success) {
        setServerError(result.error);
        for (const [field, messages] of Object.entries(
          result.fieldErrors ?? {},
        )) {
          const message = messages[0];
          if (message && isPasswordField(field)) {
            setError(field, { message });
          }
        }
        return;
      }

      setChanged(true);
      router.refresh();
    });
  });

  if (changed) {
    return (
      <div className="mt-5 space-y-4">
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"
          role="status"
        >
          密码已修改，其他设备上的登录会话已退出。
        </p>
        <div className="flex justify-end">
          <button
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800"
            onClick={onCancel}
            type="button"
          >
            完成
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
      <div>
        <label
          className="text-sm font-medium text-slate-800"
          htmlFor="account-current-password"
        >
          当前密码
        </label>
        <input
          {...register("currentPassword")}
          autoComplete="current-password"
          autoFocus
          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          id="account-current-password"
          type="password"
        />
        {errors.currentPassword?.message ? (
          <p className="mt-1 text-sm text-rose-700">
            {errors.currentPassword.message}
          </p>
        ) : null}
      </div>

      <div>
        <label
          className="text-sm font-medium text-slate-800"
          htmlFor="account-new-password"
        >
          新密码
        </label>
        <input
          {...register("password")}
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          id="account-new-password"
          type="password"
        />
        <p className="mt-1 text-xs leading-5 text-slate-500">
          至少 8 个字符，并包含大小写字母和数字。
        </p>
        {errors.password?.message ? (
          <p className="mt-1 text-sm text-rose-700">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <div>
        <label
          className="text-sm font-medium text-slate-800"
          htmlFor="account-confirm-password"
        >
          确认新密码
        </label>
        <input
          {...register("confirmPassword")}
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          id="account-confirm-password"
          type="password"
        />
        {errors.confirmPassword?.message ? (
          <p className="mt-1 text-sm text-rose-700">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p
          className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          disabled={isPending}
          onClick={onCancel}
          type="button"
        >
          取消
        </button>
        <button
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-800 disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "正在修改…" : "确认修改"}
        </button>
      </div>
    </form>
  );
}
