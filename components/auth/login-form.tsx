"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { loginAction } from "@/app/actions/auth";
import { loginSchema, type LoginInput } from "@/services/auth/schemas";

export function LoginForm({
  allowRegistration,
}: {
  allowRegistration: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((input) => {
    setServerError(null);
    startTransition(async () => {
      const result = await loginAction(input);

      if (!result.success) {
        setServerError(result.error);
        for (const [field, messages] of Object.entries(
          result.fieldErrors ?? {},
        )) {
          const message = messages[0];
          if (message && (field === "email" || field === "password")) {
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
        <label className="text-sm font-medium" htmlFor="email">
          邮箱
        </label>
        <input
          {...register("email")}
          autoComplete="email"
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="email"
          type="email"
        />
        {errors.email?.message ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.email.message}
          </p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="password">
          密码
        </label>
        <input
          {...register("password")}
          autoComplete="current-password"
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
        {isPending ? "正在登录…" : "登录"}
      </button>
      {allowRegistration ? (
        <p className="text-muted-foreground text-center text-sm">
          还没有学生账号？{" "}
          <Link className="text-foreground underline" href="/register">
            注册
          </Link>
        </p>
      ) : null}
    </form>
  );
}
