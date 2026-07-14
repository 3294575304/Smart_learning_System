"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";

import { registerAction } from "@/app/actions/auth";
import { registerSchema, type RegisterInput } from "@/services/auth/schemas";

const registerFields = [
  "displayName",
  "email",
  "password",
  "confirmPassword",
] as const;

export function RegisterForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit((input) => {
    setServerError(null);
    startTransition(async () => {
      const result = await registerAction(input);

      if (!result.success) {
        setServerError(result.error);
        for (const field of registerFields) {
          const message = result.fieldErrors?.[field]?.[0];
          if (message) {
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
    <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
      <FormField
        autoComplete="name"
        error={errors.displayName?.message}
        id="displayName"
        label="姓名"
        registration={register("displayName")}
      />
      <FormField
        autoComplete="email"
        error={errors.email?.message}
        id="email"
        label="邮箱"
        registration={register("email")}
        type="email"
      />
      <FormField
        autoComplete="new-password"
        error={errors.password?.message}
        id="password"
        label="密码"
        registration={register("password")}
        type="password"
      />
      <FormField
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        id="confirmPassword"
        label="确认密码"
        registration={register("confirmPassword")}
        type="password"
      />
      <p className="text-muted-foreground text-xs">
        自助注册仅创建学生账号；教师和管理员账号由管理员维护。
      </p>
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
        {isPending ? "正在注册…" : "注册学生账号"}
      </button>
      <p className="text-muted-foreground text-center text-sm">
        已有账号？{" "}
        <Link className="text-foreground underline" href="/login">
          返回登录
        </Link>
      </p>
    </form>
  );
}

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  type?: "email" | "password" | "text";
  autoComplete: string;
  registration: UseFormRegisterReturn;
}

function FormField({
  id,
  label,
  error,
  type = "text",
  autoComplete,
  registration,
}: FormFieldProps) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <input
        {...registration}
        autoComplete={autoComplete}
        className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
        id={id}
        type={type}
      />
      {error ? <p className="text-destructive mt-1 text-sm">{error}</p> : null}
    </div>
  );
}
