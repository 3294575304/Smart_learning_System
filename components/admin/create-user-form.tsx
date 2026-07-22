"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Role } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { requestAdminApi } from "@/components/admin/request-api";
import { ROLE_LABELS } from "@/components/admin/user-labels";
import {
  createAdminUserSchema,
  type CreateAdminUserData,
  type CreateAdminUserInput,
} from "@/services/admin/users/schemas";
import type { AdminUserView } from "@/services/admin/users/types";

const formFields = ["displayName", "email", "password", "role"] as const;

export function CreateUserForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateAdminUserInput, unknown, CreateAdminUserData>({
    resolver: zodResolver(createAdminUserSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      role: Role.STUDENT,
    },
  });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    const result = await requestAdminApi<AdminUserView>("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!result.success) {
      setServerError(result.error);
      for (const field of formFields) {
        const message = result.fieldErrors?.[field]?.[0];
        if (message) setError(field, { message });
      }
      return;
    }
    window.alert("用户创建成功。请通过安全渠道向用户提供初始密码。");
    router.push("/admin/users");
    router.refresh();
  });

  return (
    <form
      className="bg-card space-y-5 rounded-xl border p-5"
      noValidate
      onSubmit={onSubmit}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="姓名" message={errors.displayName?.message}>
          <input
            {...register("displayName")}
            className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
            placeholder="例如：张老师"
          />
        </Field>
        <Field label="邮箱" message={errors.email?.message}>
          <input
            {...register("email")}
            autoComplete="email"
            className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
            placeholder="name@example.com"
            type="email"
          />
        </Field>
        <Field label="角色" message={errors.role?.message}>
          <select
            {...register("role")}
            className="border-input focus:ring-ring mt-2 w-full rounded-md border bg-white px-3 py-2 outline-none focus:ring-2"
          >
            {Object.values(Role).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="初始密码" message={errors.password?.message}>
          <input
            {...register("password")}
            autoComplete="new-password"
            className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
            type="password"
          />
        </Field>
      </div>
      <p className="text-muted-foreground rounded-md bg-gray-50 p-3 text-sm">
        系统目前没有邀请邮件或密码重置能力。初始密码会立即进行哈希存储，创建后不会再次显示，请通过安全渠道交付。
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
        className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "正在创建…" : "创建用户"}
      </button>
    </form>
  );
}

function Field({
  children,
  label,
  message,
}: {
  children: React.ReactNode;
  label: string;
  message?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      {children}
      {message ? (
        <span className="text-destructive mt-1 block">{message}</span>
      ) : null}
    </label>
  );
}
