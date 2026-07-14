"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
  createClassroomSchema,
  type CreateClassroomData,
  type CreateClassroomInput,
} from "@/services/classrooms/schemas";
import { requestApi } from "@/components/classrooms/request-api";

interface ClassroomFormProps {
  mode: "create" | "edit";
  classroomId?: string;
  defaultValues?: CreateClassroomInput;
}

const formFields = ["name", "description", "allowStudentLeave"] as const;

export function ClassroomForm({
  mode,
  classroomId,
  defaultValues = {
    name: "",
    description: "",
    allowStudentLeave: true,
  },
}: ClassroomFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateClassroomInput, unknown, CreateClassroomData>({
    resolver: zodResolver(createClassroomSchema),
    defaultValues,
  });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    const endpoint =
      mode === "create"
        ? "/api/teacher/classrooms"
        : `/api/teacher/classrooms/${classroomId}`;
    const result = await requestApi<{ id: string }>(endpoint, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!result.success) {
      setServerError(result.error);
      for (const field of formFields) {
        const message = result.fieldErrors?.[field]?.[0];
        if (message) {
          setError(field, { message });
        }
      }
      return;
    }

    if (mode === "create") {
      router.push(`/teacher/classrooms/${result.data.id}`);
    }
    router.refresh();
  });

  return (
    <form
      className="bg-card space-y-4 rounded-xl border p-5"
      onSubmit={onSubmit}
      noValidate
    >
      <div>
        <label className="text-sm font-medium" htmlFor={`${mode}-name`}>
          班级名称
        </label>
        <input
          {...register("name")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id={`${mode}-name`}
          placeholder="例如：初一数学一班"
        />
        {errors.name ? (
          <p className="text-destructive mt-1 text-sm">{errors.name.message}</p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor={`${mode}-description`}>
          班级描述
        </label>
        <textarea
          {...register("description")}
          className="border-input focus:ring-ring mt-2 min-h-24 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id={`${mode}-description`}
          placeholder="可选，介绍课程安排或学习目标"
        />
        {errors.description ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.description.message}
          </p>
        ) : null}
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          {...register("allowStudentLeave")}
          className="mt-1 size-4"
          type="checkbox"
        />
        <span>
          <span className="font-medium">允许学生主动退出</span>
          <span className="text-muted-foreground block">
            主动退出的学生之后仍可使用有效邀请码重新加入。
          </span>
        </span>
      </label>
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
        {isSubmitting
          ? mode === "create"
            ? "正在创建…"
            : "正在保存…"
          : mode === "create"
            ? "创建班级"
            : "保存修改"}
      </button>
    </form>
  );
}
