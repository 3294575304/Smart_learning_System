"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, IdCard, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { loginAction } from "@/app/actions/auth";
import { loginSchema, type LoginInput } from "@/services/auth/schemas";
import { AuthField, AuthSelectField } from "@/components/auth/auth-field";
import type { SchoolOption } from "@/services/schools/types";

export function LoginForm({
  allowRegistration,
  schools,
}: {
  allowRegistration: boolean;
  schools: SchoolOption[];
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
    defaultValues: { schoolId: "", email: "", password: "" },
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
          if (
            message &&
            (field === "schoolId" || field === "email" || field === "password")
          ) {
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
      <AuthSelectField
        error={errors.schoolId?.message}
        icon={Building2}
        id="schoolId"
        label="学校"
        options={schools}
        registration={register("schoolId")}
      />
      <AuthField
        autoComplete="username"
        error={errors.email?.message}
        icon={IdCard}
        id="email"
        label="登录账号"
        placeholder="请输入学号/教工号或邮箱"
        registration={register("email")}
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
      {schools.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          当前没有可选学校，请联系管理员完成学校绑定。
        </p>
      ) : null}
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
        disabled={isPending || schools.length === 0}
        type="submit"
      >
        {isPending ? "正在登录…" : "登录"}
      </button>
      {allowRegistration ? (
        <p className="text-muted-foreground text-center text-sm">
          还没有学生账号？{" "}
          <Link className="font-medium text-sky-700 underline" href="/register">
            注册
          </Link>
        </p>
      ) : null}
    </form>
  );
}
