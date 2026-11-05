"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { IdCard, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { adminLoginAction } from "@/app/actions/auth";
import { AuthField } from "@/components/auth/auth-field";
import {
  adminLoginSchema,
  type AdminLoginInput,
} from "@/services/auth/schemas";

export function AdminLoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit((input) => {
    setServerError(null);
    startTransition(async () => {
      const result = await adminLoginAction(input);
      if (!result.success) {
        setServerError(result.error);
        for (const field of ["email", "password"] as const) {
          const message = result.fieldErrors?.[field]?.[0];
          if (message) setError(field, { message });
        }
        return;
      }

      router.push(result.data.redirectTo);
      router.refresh();
    });
  });

  return (
    <form className="mt-8 space-y-5" noValidate onSubmit={onSubmit}>
      <AuthField
        autoComplete="username"
        error={errors.email?.message}
        icon={IdCard}
        id="email"
        label="管理员账号"
        placeholder="请输入管理员邮箱"
        registration={register("email")}
        type="email"
      />
      <AuthField
        autoComplete="current-password"
        error={errors.password?.message}
        icon={KeyRound}
        id="password"
        label="密码"
        placeholder="请输入密码"
        registration={register("password")}
        type="password"
      />
      {serverError ? (
        <p
          className="bg-destructive/10 text-destructive rounded-md p-3 text-sm"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}
      <button
        className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2 font-medium shadow-sm shadow-sky-200 transition hover:bg-sky-700 disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "正在登录…" : "管理员登录"}
      </button>
      <p className="text-muted-foreground text-center text-sm">
        <Link className="font-medium text-sky-700 underline" href="/login">
          返回师生登录
        </Link>
      </p>
    </form>
  );
}
