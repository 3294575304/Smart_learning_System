"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Role, UserStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { requestAdminApi } from "@/components/admin/request-api";
import {
  ROLE_LABELS,
  USER_STATUS_LABELS,
} from "@/components/admin/user-labels";
import {
  updateAdminUserSchema,
  type UpdateAdminUserData,
  type UpdateAdminUserInput,
} from "@/services/admin/users/schemas";
import type { AdminUserView } from "@/services/admin/users/types";

const formFields = ["displayName", "email", "role", "status"] as const;

export function EditUserForm({
  user,
  currentAdminId,
}: {
  user: AdminUserView;
  currentAdminId: string;
}) {
  const router = useRouter();
  const isSelf = user.id === currentAdminId;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAdminUserInput, unknown, UpdateAdminUserData>({
    resolver: zodResolver(updateAdminUserSchema),
    defaultValues: {
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });

  const onSubmit = handleSubmit(async (input) => {
    if (
      user.status === UserStatus.ACTIVE &&
      input.status === UserStatus.INACTIVE &&
      !window.confirm(
        `确认禁用“${user.displayName}”吗？该用户的现有登录会话会立即失效。`,
      )
    ) {
      return;
    }
    setServerError(null);
    const result = await requestAdminApi<AdminUserView>(
      `/api/admin/users/${user.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!result.success) {
      setServerError(result.error);
      for (const field of formFields) {
        const message = result.fieldErrors?.[field]?.[0];
        if (message) setError(field, { message });
      }
      return;
    }
    window.alert("用户资料已保存。");
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
          />
        </Field>
        <Field label="邮箱" message={errors.email?.message}>
          <input
            {...register("email")}
            className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
            type="email"
          />
        </Field>
        <Field label="角色" message={errors.role?.message}>
          <select
            {...register("role")}
            className="border-input focus:ring-ring mt-2 w-full rounded-md border bg-white px-3 py-2 outline-none focus:ring-2 disabled:bg-gray-100"
            disabled={isSelf && user.role === Role.ADMIN}
          >
            {Object.values(Role).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="状态" message={errors.status?.message}>
          <select
            {...register("status")}
            className="border-input focus:ring-ring mt-2 w-full rounded-md border bg-white px-3 py-2 outline-none focus:ring-2 disabled:bg-gray-100"
            disabled={isSelf}
          >
            {Object.values(UserStatus).map((status) => (
              <option key={status} value={status}>
                {USER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {isSelf ? (
        <p className="text-muted-foreground rounded-md bg-gray-50 p-3 text-sm">
          为防止管理员锁定自己，当前账号不能被禁用，也不能降低管理员角色。
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        已有教师或学生业务数据的账号不能直接跨角色修改，以免历史数据失去正确归属。
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
        {isSubmitting ? "正在保存…" : "保存修改"}
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
