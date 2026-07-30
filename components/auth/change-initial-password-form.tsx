"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { changeInitialPasswordAction } from "@/app/actions/auth";
import {
  changeInitialPasswordSchema,
  type ChangeInitialPasswordInput,
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

export function ChangeInitialPasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ChangeInitialPasswordInput>({
    resolver: zodResolver(changeInitialPasswordSchema),
    defaultValues: {
      currentPassword: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit((input) => {
    setServerError(null);
    startTransition(async () => {
      const result = await changeInitialPasswordAction(input);

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

      router.push(result.data.redirectTo);
      router.refresh();
    });
  });

  return (
    <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
      <div>
        <label className="text-sm font-medium" htmlFor="currentPassword">
          当前初始密码
        </label>
        <input
          {...register("currentPassword")}
          autoComplete="current-password"
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="currentPassword"
          type="password"
        />
        {errors.currentPassword?.message ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.currentPassword.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="password">
          新密码
        </label>
        <input
          {...register("password")}
          autoComplete="new-password"
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="password"
          type="password"
        />
        {errors.password?.message ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="confirmPassword">
          确认新密码
        </label>
        <input
          {...register("confirmPassword")}
          autoComplete="new-password"
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="confirmPassword"
          type="password"
        />
        {errors.confirmPassword?.message ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p
          className="bg-destructive/10 text-destructive rounded-md p-3 text-sm"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}

      <button
        className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2 font-medium disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "正在修改..." : "修改密码"}
      </button>
    </form>
  );
}
