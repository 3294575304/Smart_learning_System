"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Building2,
  IdCard,
  KeyRound,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { loginAction } from "@/app/actions/auth";
import { loginSchema, type LoginInput } from "@/services/auth/schemas";
import { AuthField, AuthSelectField } from "@/components/auth/auth-field";
import type { SchoolOption } from "@/services/schools/types";
import styles from "./login-space.module.css";
import { LoginCaptcha } from "./login-captcha";

export function LoginForm({
  allowRegistration,
  schools,
}: {
  allowRegistration: boolean;
  schools: SchoolOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [captchaRevision, setCaptchaRevision] = useState(0);
  const [captchaReady, setCaptchaReady] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      schoolId: "",
      email: "",
      password: "",
      captchaId: "",
      captchaAnswer: "",
    },
  });

  const onChallengeChange = useCallback(
    (id: string) => {
      setValue("captchaId", id);
      setValue("captchaAnswer", "");
      clearErrors(["captchaId", "captchaAnswer"]);
      setCaptchaReady(Boolean(id));
    },
    [setValue, clearErrors],
  );

  const onSubmit = handleSubmit((input) => {
    setServerError(null);
    startTransition(async () => {
      try {
        const result = await loginAction(input);

        if (!result.success) {
          setServerError(result.error);
          setCaptchaRevision((revision) => revision + 1);
          for (const [field, messages] of Object.entries(
            result.fieldErrors ?? {},
          )) {
            const message = messages[0];
            if (
              message &&
              (field === "schoolId" ||
                field === "email" ||
                field === "password" ||
                field === "captchaId" ||
                field === "captchaAnswer")
            ) {
              setError(field, { message });
            }
          }
          return;
        }

        router.push(result.data.redirectTo);
        router.refresh();
      } catch {
        setServerError("登录暂时失败，请稍后重试");
        setCaptchaRevision((revision) => revision + 1);
      }
    });
  });

  return (
    <form
      className={styles.form}
      onSubmit={onSubmit}
      noValidate
      aria-busy={isPending}
    >
      <AuthSelectField
        className={styles.field}
        error={errors.schoolId?.message}
        icon={Building2}
        id="schoolId"
        label="学校"
        options={schools}
        registration={register("schoolId")}
      />
      <AuthField
        className={styles.field}
        autoComplete="username"
        error={errors.email?.message}
        icon={IdCard}
        id="email"
        label="登录账号"
        placeholder="请输入学号/教工号或邮箱"
        registration={register("email")}
      />
      <AuthField
        className={styles.field}
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
      <input type="hidden" {...register("captchaId")} />
      <LoginCaptcha
        registration={register("captchaAnswer")}
        onChallengeChange={onChallengeChange}
        resetKey={captchaRevision}
        error={errors.captchaAnswer?.message ?? errors.captchaId?.message}
        disabled={isPending}
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
        className={styles.submit}
        disabled={isPending || !captchaReady || schools.length === 0}
        type="submit"
      >
        {isPending ? "正在登录…" : "登录"}
        {isPending ? (
          <LoaderCircle
            aria-hidden="true"
            className="motion-safe:animate-spin"
            size={16}
          />
        ) : (
          <ArrowRight aria-hidden="true" size={16} />
        )}
      </button>
      {allowRegistration ? (
        <p className={styles.registration}>
          还没有学生账号？ <Link href="/register">注册</Link>
        </p>
      ) : null}
    </form>
  );
}
