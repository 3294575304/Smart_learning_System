"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";

import { requestApi } from "@/components/courses/request-api";
import { CourseCatalogSelect } from "@/components/courses/course-catalog-select";
import { CourseCover } from "@/components/courses/course-cover";
import { normalizeCourseNo } from "@/lib/course-no";
import {
  createCourseSchema,
  updateCourseSchema,
  type CreateCourseData,
  type CreateCourseInput,
  type UpdateCourseData,
  type UpdateCourseInput,
} from "@/services/courses/schemas";
import type {
  TeacherCourseCategoryOption,
  TeacherCourseTemplateOption,
} from "@/services/courses/types";

type QuestionCategoryOption = TeacherCourseCategoryOption;

interface CreateCourseFormProps {
  mode: "create";
  templates: TeacherCourseTemplateOption[];
  categories: QuestionCategoryOption[];
  defaultTemplateId?: string;
  defaultValues?: CreateCourseInput;
}

interface EditCourseFormProps {
  mode: "edit";
  courseId: string;
  template: TeacherCourseTemplateOption;
  templates: TeacherCourseTemplateOption[];
  categories: QuestionCategoryOption[];
  defaultValues: UpdateCourseInput;
}

type Props = CreateCourseFormProps | EditCourseFormProps;

const FIELD_ORDER = [
  "templateId",
  "questionCategoryId",
  "courseNo",
  "term",
  "name",
  "description",
] as const;

const inputClass =
  "border-input focus:ring-ring mt-2 w-full rounded-md border px-3 py-2 outline-none focus:ring-2";
const lockedInputClass =
  "border-input mt-2 w-full rounded-md border bg-slate-50 px-3 py-2 text-slate-600 outline-none";

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
    // 课程目录必须由教师显式选择，避免默认选中一门与本次开课无关的课程。
    questionCategoryId: "",
    courseNo: "",
    term: "",
    name: selected?.name ?? "",
    description: "",
  };
}

interface CatalogFieldProps {
  categories: QuestionCategoryOption[];
  value: string;
  onSelect: (option: QuestionCategoryOption) => void;
  error?: string;
  hint?: string;
}

function CatalogField({
  categories,
  value,
  onSelect,
  error,
  hint,
}: CatalogFieldProps) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor="course-category">
        课程分类
      </label>
      <div className="mt-2">
        <CourseCatalogSelect
          describedBy="course-category-hint"
          id="course-category"
          onSelect={onSelect}
          options={categories}
          value={value}
        />
      </div>
      <p
        className="text-muted-foreground mt-1 text-xs"
        id="course-category-hint"
      >
        {hint ?? "按课程号或课程名称搜索，选中后自动带出课程名称与课程号。"}
      </p>
      {error ? <p className="text-destructive mt-1 text-sm">{error}</p> : null}
    </div>
  );
}

function CourseNoField({
  registration,
  lockedCourseNo,
  categorySelected,
  error,
}: {
  registration: UseFormRegisterReturn;
  lockedCourseNo: string | null;
  categorySelected: boolean;
  error?: string;
}) {
  const hint = !categorySelected
    ? "选择课程目录后会自动带出课程号；目录未维护课程号时可手动填写。"
    : lockedCourseNo
      ? "课程号由课程目录决定；如需调整，请联系管理员修改课程分类。"
      : "该课程在目录中未设置课程号，可手动填写。";
  return (
    <div>
      <label className="text-sm font-medium" htmlFor="course-no">
        课程号
      </label>
      <input
        {...registration}
        aria-describedby="course-no-hint"
        className={lockedCourseNo ? lockedInputClass : inputClass}
        id="course-no"
        placeholder="PYTHON-2026"
        readOnly={Boolean(lockedCourseNo)}
      />
      <p className="text-muted-foreground mt-1 text-xs" id="course-no-hint">
        {hint}
      </p>
      {error ? <p className="text-destructive mt-1 text-sm">{error}</p> : null}
    </div>
  );
}

function CreateCourseForm({
  templates,
  categories,
  defaultTemplateId,
  defaultValues,
}: CreateCourseFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateCourseInput, unknown, CreateCourseData>({
    resolver: zodResolver(createCourseSchema),
    defaultValues:
      defaultValues ?? buildTemplateDefaults(templates, defaultTemplateId),
  });

  const categoryId = watch("questionCategoryId") ?? "";
  const selectedCategory =
    categories.find((category) => category.id === categoryId) ?? null;
  const lockedCourseNo = selectedCategory?.courseNo ?? null;
  // 本校只有一种可用模板时不展示选择器，直接沿用默认模板；多模板时才让教师选。
  const hasTemplateChoice = templates.length > 1;

  function chooseCategory(option: QuestionCategoryOption) {
    setServerError(null);
    setValue("questionCategoryId", option.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("name", option.name, { shouldDirty: true, shouldValidate: true });
    setValue("courseNo", option.courseNo ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    const result = await requestApi<{ id: string }>("/api/teacher/courses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, description: input.description ?? "" }),
    });

    if (!result.success) {
      setServerError(result.error);
      for (const field of FIELD_ORDER) {
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
      {hasTemplateChoice ? (
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
      ) : null}
      <CatalogField
        categories={categories}
        error={errors.questionCategoryId?.message}
        onSelect={chooseCategory}
        value={categoryId}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <CourseNoField
          categorySelected={Boolean(selectedCategory)}
          error={errors.courseNo?.message}
          lockedCourseNo={lockedCourseNo}
          registration={register("courseNo")}
        />
        <div>
          <label className="text-sm font-medium" htmlFor="course-term">
            学期
          </label>
          <input
            {...register("term")}
            className={inputClass}
            id="course-term"
            placeholder="2026-2027-1"
          />
          {errors.term ? (
            <p className="text-destructive mt-1 text-sm">
              {errors.term.message}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="course-name">
          课程名称
        </label>
        <input {...register("name")} className={inputClass} id="course-name" />
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
        className="tt-btn-cta bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "创建中..." : "创建课程"}
      </button>
      {hasTemplateChoice ? null : (
        <input type="hidden" {...register("templateId")} />
      )}
    </form>
  );
}

function EditCourseForm({
  courseId,
  template,
  templates,
  categories,
  defaultValues,
}: EditCourseFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdateCourseInput, unknown, UpdateCourseData>({
    resolver: zodResolver(updateCourseSchema),
    defaultValues: { ...defaultValues, templateId: template.id },
  });

  const templateId = watch("templateId") ?? template.id;
  const selectedTemplate =
    templates.find((item) => item.id === templateId) ?? template;
  const courseNo = watch("courseNo") ?? "";
  const categoryId = watch("questionCategoryId") ?? "";
  const selectedCategory =
    categories.find((category) => category.id === categoryId) ?? null;
  const catalogCourseNo = selectedCategory?.courseNo ?? null;
  const courseNoMismatch =
    Boolean(catalogCourseNo) && normalizeCourseNo(courseNo) !== catalogCourseNo;

  function chooseCategory(option: QuestionCategoryOption) {
    setServerError(null);
    setValue("questionCategoryId", option.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
    // 教师主动选择目录课程时带出课程号；仅在目录维护了课程号时覆盖。
    if (option.courseNo) {
      setValue("courseNo", option.courseNo, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }

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
      for (const field of FIELD_ORDER) {
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
      <div>
        <label className="text-sm font-medium" htmlFor="course-template">
          课程模板
        </label>
        <select
          {...register("templateId")}
          className="border-input focus:ring-ring mt-2 w-full rounded-md border bg-white px-3 py-2 outline-none focus:ring-2"
          id="course-template"
        >
          {templates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}（{item.code}）
            </option>
          ))}
        </select>
        {errors.templateId ? (
          <p className="text-destructive mt-1 text-sm">
            {errors.templateId.message}
          </p>
        ) : null}
        <div className="mt-2 overflow-hidden rounded-lg border">
          <CourseCover
            courseNo={courseNo}
            coverKey={selectedTemplate.coverKey}
            height={52}
          />
        </div>
      </div>
      <CatalogField
        categories={categories}
        error={errors.questionCategoryId?.message}
        hint="按课程号或课程名称搜索；更换课程分类会同步带入该目录的课程号。"
        onSelect={chooseCategory}
        value={categoryId}
      />
      {courseNoMismatch ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="leading-6">
            当前课程号与课程目录不一致：目录中的课程号为{" "}
            <span className="font-mono font-medium">{catalogCourseNo}</span>。
            系统不会自动修改已有课程，可一键对齐后再保存。
          </p>
          <button
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm"
            onClick={() => {
              if (!catalogCourseNo) return;
              setValue("courseNo", catalogCourseNo, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }}
            type="button"
          >
            改为目录课程号
          </button>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <CourseNoField
          categorySelected={Boolean(selectedCategory)}
          error={errors.courseNo?.message}
          lockedCourseNo={catalogCourseNo}
          registration={register("courseNo")}
        />
        <div>
          <label className="text-sm font-medium" htmlFor="course-term">
            学期
          </label>
          <input
            {...register("term")}
            className={inputClass}
            id="course-term"
          />
          {errors.term ? (
            <p className="text-destructive mt-1 text-sm">
              {errors.term.message}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="course-name">
          课程名称
        </label>
        <input {...register("name")} className={inputClass} id="course-name" />
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
        className="tt-btn-cta bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
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
