"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  IdCard,
  KeyRound,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { registerAction } from "@/app/actions/auth";
import { registerSchema, type RegisterInput } from "@/services/auth/schemas";
import { AuthField, AuthSelectField } from "@/components/auth/auth-field";
import type { SchoolOption } from "@/services/schools/types";

const registerFields = [
  "schoolId",
  "studentNo",
  "displayName",
  "email",
  "password",
  "confirmPassword",
] as const;

export function RegisterForm({ schools }: { schools: SchoolOption[] }) {
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
      schoolId: "",
      studentNo: "",
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
        error={errors.studentNo?.message}
        icon={IdCard}
        id="studentNo"
        label="学号"
        placeholder="请输入学号"
        registration={register("studentNo")}
      />
      <AuthField
        autoComplete="name"
        error={errors.displayName?.message}
        icon={UserRound}
        id="displayName"
        label="姓名"
        placeholder="请输入姓名"
        registration={register("displayName")}
      />
      <AuthField
        autoComplete="email"
        error={errors.email?.message}
        icon={Mail}
        id="email"
        label="邮箱"
        placeholder="请输入邮箱"
        registration={register("email")}
        type="email"
      />
      <AuthField
        autoComplete="new-password"
        error={errors.password?.message}
        icon={KeyRound}
        id="password"
        label="密码"
        placeholder="请设置密码"
        registration={register("password")}
        type="password"
      />
      <AuthField
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        icon={LockKeyhole}
        id="confirmPassword"
        label="确认密码"
        placeholder="请再次输入密码"
        registration={register("confirmPassword")}
        type="password"
      />
      <p className="text-muted-foreground text-xs">
        学生账号仅限已导入名单中的学生注册。请使用教师提供的学号，并填写与名单一致的姓名。
      </p>
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
        {isPending ? "正在注册…" : "注册学生账号"}
      </button>
      <p className="text-muted-foreground text-center text-sm">
        已有账号？{" "}
        <Link className="font-medium text-sky-700 underline" href="/login">
          返回登录
        </Link>
      </p>
    </form>
  );
}
