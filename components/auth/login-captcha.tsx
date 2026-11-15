"use client";

import { LoaderCircle, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { captchaResponseSchema } from "@/services/auth/captcha-schema";
import { AuthField } from "./auth-field";
import styles from "./login-space.module.css";

interface LoginCaptchaProps {
  registration: UseFormRegisterReturn;
  onChallengeChange: (id: string) => void;
  resetKey: number;
  error?: string;
  disabled: boolean;
}

export function LoginCaptcha({
  registration,
  onChallengeChange,
  resetKey,
  error,
  disabled,
}: LoginCaptchaProps) {
  const [revision, setRevision] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const previousId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    onChallengeChange("");
    setLoading(true);
    setLoadError(null);
    setImage(null);
    async function load() {
      try {
        const response = await fetch("/api/auth/captcha", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previousId: previousId.current }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Captcha unavailable");
        const result = captchaResponseSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        previousId.current = result.data.id;
        setImage(result.data.image);
        onChallengeChange(result.data.id);
        timer = setTimeout(
          () => {
            onChallengeChange("");
            setLoadError("验证码已过期，请点击图片换一张。");
          },
          Math.max(0, result.data.expiresAt - Date.now()),
        );
      } catch {
        if (!controller.signal.aborted)
          setLoadError("验证码加载失败，请点击右侧重试。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [onChallengeChange, resetKey, revision]);

  return (
    <div>
      <div className={styles.captchaRow}>
        <AuthField
          className={styles.field}
          id="captchaAnswer"
          label="图形验证码"
          icon={ShieldCheck}
          placeholder="输入 5 位字符"
          autoComplete="off"
          registration={registration}
          error={error}
          maxLength={5}
          disabled={disabled || loading || Boolean(loadError)}
        />
        <button
          className={styles.captchaImage}
          type="button"
          onClick={() => setRevision((current) => current + 1)}
          disabled={disabled || loading}
          aria-label={loadError ? "重新加载验证码" : "换一张验证码"}
          title="点击换一张"
        >
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className="motion-safe:animate-spin"
              size={20}
            />
          ) : image ? (
            <Image
              src={image}
              width={176}
              height={64}
              alt="图形验证码，点击可换一张"
              unoptimized
            />
          ) : (
            "点击重试"
          )}
        </button>
      </div>
      <p
        className={loadError ? styles.captchaError : styles.captchaHint}
        role="status"
      >
        {loadError ??
          (loading
            ? "正在加载验证码…"
            : "不区分大小写 · 看不清？点击图片换一张")}
      </p>
    </div>
  );
}
