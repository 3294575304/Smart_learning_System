"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  joinClassroomSchema,
  type JoinClassroomInput,
} from "@/services/classrooms/schemas";
import { requestApi } from "@/components/classrooms/request-api";

interface JoinClassroomFormProps {
  compact?: boolean;
  inputId?: string;
  onSuccess?: () => void;
}

export function JoinClassroomForm({
  compact = false,
  inputId = "join-code",
  onSuccess,
}: JoinClassroomFormProps = {}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<JoinClassroomInput>({
    resolver: zodResolver(joinClassroomSchema),
    defaultValues: { joinCode: "" },
  });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    const result = await requestApi<{ id: string }>(
      "/api/student/classrooms/join",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!result.success) {
      setServerError(result.error);
      const message = result.fieldErrors?.joinCode?.[0];
      if (message) {
        setError("joinCode", { message });
      }
      return;
    }
    reset();
    onSuccess?.();
    router.refresh();
  });

  return (
    <form
      className={compact ? "space-y-2" : "bg-card rounded-xl border p-5"}
      onSubmit={onSubmit}
      noValidate
    >
      <label className="text-sm font-medium" htmlFor={inputId}>
        班级邀请码
      </label>
      <div
        className={
          compact ? "space-y-2" : "mt-2 flex flex-col gap-3 sm:flex-row"
        }
      >
        <input
          {...register("joinCode")}
          autoComplete="off"
          className={`border-input focus:ring-ring min-w-0 flex-1 rounded-md border px-3 py-2 font-mono uppercase outline-none focus:ring-2 ${
            compact ? "w-full" : ""
          }`}
          id={inputId}
          placeholder="请输入邀请码"
        />
        <button
          className={`bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${
            compact ? "w-full" : ""
          }`}
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "正在加入…" : "加入班级"}
        </button>
      </div>
      {errors.joinCode ? (
        <p className="text-destructive mt-2 text-sm">
          {errors.joinCode.message}
        </p>
      ) : null}
      {serverError ? (
        <p
          className="bg-destructive/10 text-destructive mt-3 rounded-md p-3 text-sm"
          role="alert"
        >
          {serverError}
        </p>
      ) : null}
    </form>
  );
}
