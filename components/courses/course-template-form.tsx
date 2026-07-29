"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { requestApi } from "@/components/courses/request-api";
import {
  createCourseTemplateSchema,
  updateCourseTemplateSchema,
  type CreateCourseTemplateData,
  type CreateCourseTemplateInput,
  type UpdateCourseTemplateData,
  type UpdateCourseTemplateInput,
} from "@/services/courses/schemas";

interface BaseProps {
  templateId?: string;
}

interface CreateProps extends BaseProps {
  mode: "create";
  defaultValues?: CreateCourseTemplateInput;
}

interface EditProps extends BaseProps {
  mode: "edit";
  defaultValues: UpdateCourseTemplateInput;
  code: string;
  isActive: boolean;
  isBuiltin: boolean;
}

type Props = CreateProps | EditProps;

function CreateCourseTemplateForm({ defaultValues }: CreateProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateCourseTemplateInput, unknown, CreateCourseTemplateData>({
    resolver: zodResolver(createCourseTemplateSchema),
    defaultValues: defaultValues ?? {
      code: "",
      name: "",
      description: "",
      version: "1.0",
    },
  });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    const result = await requestApi<{ id: string }>(
      "/api/admin/course-templates",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!result.success) {
      setServerError(result.error);
      for (const field of ["code", "name", "description", "version"] as const) {
        const message = result.fieldErrors?.[field]?.[0];
        if (message) {
          setError(field, { message });
        }
      }
      return;
    }

    router.push("/admin/course-templates");
    router.refresh();
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div>
        <label className="text-sm font-medium" htmlFor="template-code">
          模板编码
        </label>
        <input
          {...register("code")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="template-code"
          placeholder="python-programming-v1"
        />
        {errors.code ? (
          <p className="text-destructive mt-1 text-sm">{errors.code.message}</p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="template-name">
          模板名称
        </label>
        <input
          {...register("name")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="template-name"
          placeholder="Python 程序设计"
        />
        {errors.name ? (
          <p className="text-destructive mt-1 text-sm">{errors.name.message}</p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="template-version">
          版本
        </label>
        <input
          {...register("version")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="template-version"
          placeholder="1.0"
        />
        {errors.version ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.version.message}
          </p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="template-description">
          模板描述
        </label>
        <textarea
          {...register("description")}
          className="border-input focus:ring-ring mt-2 min-h-24 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="template-description"
          placeholder="描述模板适用范围和基础课程说明"
        />
        {errors.description ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.description.message}
          </p>
        ) : null}
      </div>
      {serverError ? (
        <p className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {serverError}
        </p>
      ) : null}
      <button
        className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "保存中..." : "创建模板"}
      </button>
    </form>
  );
}

function EditCourseTemplateForm({
  templateId,
  code,
  isActive,
  isBuiltin,
  defaultValues,
}: BaseProps & EditProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateCourseTemplateInput, unknown, UpdateCourseTemplateData>({
    resolver: zodResolver(updateCourseTemplateSchema),
    defaultValues,
  });

  const onSubmit = handleSubmit(async (input) => {
    if (!templateId) return;
    setServerError(null);
    const result = await requestApi<{ id: string }>(
      `/api/admin/course-templates/${templateId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!result.success) {
      setServerError(result.error);
      for (const field of ["name", "description", "version"] as const) {
        const message = result.fieldErrors?.[field]?.[0];
        if (message) {
          setError(field, { message });
        }
      }
      return;
    }

    router.refresh();
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="rounded-lg border bg-gray-50 p-3 text-sm">
        <p className="font-medium">模板编码：{code}</p>
        <p className="text-muted-foreground mt-1">
          {isBuiltin ? "内置模板" : "自定义模板"} ·{" "}
          {isActive ? "当前可用" : "当前停用"}
        </p>
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="template-name">
          模板名称
        </label>
        <input
          {...register("name")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="template-name"
        />
        {errors.name ? (
          <p className="text-destructive mt-1 text-sm">{errors.name.message}</p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="template-version">
          版本
        </label>
        <input
          {...register("version")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="template-version"
        />
        {errors.version ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.version.message}
          </p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="template-description">
          模板描述
        </label>
        <textarea
          {...register("description")}
          className="border-input focus:ring-ring mt-2 min-h-24 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="template-description"
        />
        {errors.description ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.description.message}
          </p>
        ) : null}
      </div>
      {serverError ? (
        <p className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
          {serverError}
        </p>
      ) : null}
      <button
        className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "保存中..." : "保存修改"}
      </button>
    </form>
  );
}

export function CourseTemplateForm(props: Props) {
  return props.mode === "create" ? (
    <CreateCourseTemplateForm {...props} />
  ) : (
    <EditCourseTemplateForm {...props} />
  );
}
