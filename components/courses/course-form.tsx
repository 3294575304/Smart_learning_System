"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { requestApi } from "@/components/courses/request-api";
import {
  createCourseSchema,
  updateCourseSchema,
  type CreateCourseData,
  type CreateCourseInput,
  type UpdateCourseData,
  type UpdateCourseInput,
} from "@/services/courses/schemas";
import type {
  TeacherCourseTemplateOption,
} from "@/services/courses/types";

interface CreateCourseFormProps {
  mode: "create";
  templates: TeacherCourseTemplateOption[];
  defaultTemplateId?: string;
  defaultValues?: CreateCourseInput;
}

interface EditCourseFormProps {
  mode: "edit";
  courseId: string;
  template: TeacherCourseTemplateOption;
  defaultValues: UpdateCourseInput;
}

type Props = CreateCourseFormProps | EditCourseFormProps;

function buildTemplateDefaults(
  templates: TeacherCourseTemplateOption[],
  defaultTemplateId?: string,
) {
  const selected =
    templates.find((template) => template.id === defaultTemplateId) ??
    templates[0] ??
    null;
  return {
    templateId: selected?.id ?? "",
    courseNo: "",
    term: "",
    name: selected?.name ?? "",
    description: "",
  };
}

function CreateCourseForm({
  templates,
  defaultTemplateId,
  defaultValues,
}: CreateCourseFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateCourseInput, unknown, CreateCourseData>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: defaultValues ?? buildTemplateDefaults(templates, defaultTemplateId),
  });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    const result = await requestApi<{ id: string }>(
      "/api/teacher/courses",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!result.success) {
      setServerError(result.error);
      for (const field of ["templateId", "courseNo", "term", "name", "description"] as const) {
        const message = result.fieldErrors?.[field]?.[0];
        if (message) {
          setError(field, { message });
        }
      }
      return;
    }

    router.push(`/teacher/courses/${result.data.id}`);
    router.refresh();
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div>
        <label className="text-sm font-medium" htmlFor="course-template">
          课程模板
        </label>
        <select
          {...register("templateId")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border bg-white px-3 py-2 outline-none focus:ring-2"
          id="course-template"
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} ({template.code})
            </option>
          ))}
        </select>
        {errors.templateId ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.templateId.message}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="course-no">
            课程号
          </label>
          <input
            {...register("courseNo")}
            className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
            id="course-no"
            placeholder="PYTHON-2026"
          />
          {errors.courseNo ? (
            <p className="text-destructive mt-1 text-sm">
              {errors.courseNo.message}
            </p>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="course-term">
            学期
          </label>
          <input
            {...register("term")}
            className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
            id="course-term"
            placeholder="2026-2027-1"
          />
          {errors.term ? (
            <p className="text-destructive mt-1 text-sm">{errors.term.message}</p>
          ) : null}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="course-name">
          课程名称
        </label>
        <input
          {...register("name")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="course-name"
        />
        {errors.name ? (
          <p className="text-destructive mt-1 text-sm">{errors.name.message}</p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="course-description">
          课程描述
        </label>
        <textarea
          {...register("description")}
          className="border-input focus:ring-ring mt-2 min-h-24 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="course-description"
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
        {isSubmitting ? "创建中..." : "创建课程"}
      </button>
    </form>
  );
}

function EditCourseForm({
  courseId,
  template,
  defaultValues,
}: EditCourseFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateCourseInput, unknown, UpdateCourseData>({
    resolver: zodResolver(updateCourseSchema),
    defaultValues,
  });

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    const result = await requestApi<{ id: string }>(
      `/api/teacher/courses/${courseId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!result.success) {
      setServerError(result.error);
      for (const field of ["courseNo", "term", "name", "description"] as const) {
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
        <p className="font-medium">
          课程模板：{template.name} ({template.code})
        </p>
        <p className="text-muted-foreground mt-1">{template.isBuiltin ? "内置模板" : "自定义模板"}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="course-no">
            课程号
          </label>
          <input
            {...register("courseNo")}
            className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
            id="course-no"
          />
          {errors.courseNo ? (
            <p className="text-destructive mt-1 text-sm">
              {errors.courseNo.message}
            </p>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="course-term">
            学期
          </label>
          <input
            {...register("term")}
            className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
            id="course-term"
          />
          {errors.term ? (
            <p className="text-destructive mt-1 text-sm">{errors.term.message}</p>
          ) : null}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="course-name">
          课程名称
        </label>
        <input
          {...register("name")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="course-name"
        />
        {errors.name ? (
          <p className="text-destructive mt-1 text-sm">{errors.name.message}</p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="course-description">
          课程描述
        </label>
        <textarea
          {...register("description")}
          className="border-input focus:ring-ring mt-2 min-h-24 w-full rounded-md border px-3 py-2 outline-none focus:ring-2"
          id="course-description"
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

export function CourseForm(props: Props) {
  return props.mode === "create" ? (
    <CreateCourseForm {...props} />
  ) : (
    <EditCourseForm {...props} />
  );
}
