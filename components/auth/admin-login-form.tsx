"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, IdCard, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { adminLoginAction } from "@/app/actions/auth";
import { AuthField } from "@/components/auth/auth-field";
import styles from "./login-space.module.css";
import { LoginCaptcha } from "./login-captcha";
import {
  adminLoginSchema,
  type AdminLoginInput,
} from "@/services/auth/schemas";

export function AdminLoginForm() {
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
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
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
        const result = await adminLoginAction(input);
        if (!result.success) {
          setServerError(result.error);
          setCaptchaRevision((revision) => revision + 1);
          for (const field of [
            "email",
            "password",
            "captchaId",
            "captchaAnswer",
          ] as const) {
            const message = result.fieldErrors?.[field]?.[0];
            if (message) setError(field, { message });
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
      noValidate
      onSubmit={onSubmit}
      aria-busy={isPending}
    >
      <AuthField
        className={styles.field}
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
        disabled={isPending || !captchaReady}
        type="submit"
      >
        {isPending ? "正在登录…" : "管理员登录"}
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
      <p className={styles.registration}>
        <Link href="/login">返回师生登录</Link>
      </p>
    </form>
  );
}
