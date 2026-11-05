"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { requestAdminApi } from "@/components/admin/request-api";
import { PROVINCES, provinceName } from "@/services/schools/provinces";
import type { SchoolOption } from "@/services/schools/types";
import {
  createPartnerSchoolSchema,
  createSchoolAdminSchema,
  type CreatePartnerSchoolInput,
  type CreatePartnerSchoolData,
  type CreateSchoolAdminInput,
  type CreateSchoolAdminData,
} from "@/services/super-admin/provisioning-schemas";
import type {
  CreatedPartnerSchool,
  CreatedSchoolAdmin,
} from "@/services/super-admin/provisioning-types";

const inputClass =
  "mt-2 w-full rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
const submitClass =
  "rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-sm text-red-600"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CreatePartnerSchoolForm() {
  const router = useRouter();
  const [created, setCreated] = useState<CreatedPartnerSchool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreatePartnerSchoolInput, unknown, CreatePartnerSchoolData>({
    resolver: zodResolver(createPartnerSchoolSchema),
    defaultValues: { name: "", provinceCode: "" },
  });
  const submit = handleSubmit(async (input) => {
    setError(null);
    const result = await requestAdminApi<CreatedPartnerSchool>(
      "/api/super-admin/schools",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!result.success) {
      setError(result.error);
      for (const field of ["name", "provinceCode"] as const) {
        const message = result.fieldErrors?.[field]?.[0];
        if (message) setFieldError(field, { message });
      }
      return;
    }
    reset();
    setCreated(result.data);
    router.refresh();
  });
  if (created)
    return (
      <section
        className="rounded-xl border border-emerald-200 bg-white p-6"
        role="status"
      >
        <h2 className="text-lg font-semibold text-emerald-800">
          合作学校已添加
        </h2>
        <p className="mt-3 font-medium text-slate-800">
          {created.name}
          <span className="ml-3 text-sm font-normal text-slate-500">
            {provinceName(created.provinceCode)}
          </span>
        </p>
        <p className="mt-2 text-sm text-slate-500">
          接下来为该校创建管理员账号，开通后将计入系统应用统计。
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link
            className={submitClass}
            href={`/super-admin/schools/new-admin?${new URLSearchParams({ schoolId: created.id })}`}
          >
            为该校新建管理员
          </Link>
          <Link
            href="/super-admin/schools"
            className="text-sm text-sky-700 underline"
          >
            返回学校目录
          </Link>
          <button
            onClick={() => setCreated(null)}
            type="button"
            className="text-sm text-slate-500 underline"
          >
            继续添加学校
          </button>
        </div>
      </section>
    );
  return (
    <form
      onSubmit={submit}
      noValidate
      className="max-w-3xl space-y-6 rounded-xl border border-sky-100 bg-white p-6"
    >
      <Field
        id="partner-school-name"
        label="合作学校名称"
        error={errors.name?.message}
      >
        <input
          {...register("name")}
          id="partner-school-name"
          className={inputClass}
          autoComplete="organization"
          maxLength={120}
          placeholder="请输入学校全称"
          aria-invalid={!!errors.name}
          aria-describedby={
            errors.name ? "partner-school-name-error" : undefined
          }
        />
      </Field>
      <Field
        id="partner-school-province"
        label="所在省级地区"
        error={errors.provinceCode?.message}
      >
        <select
          {...register("provinceCode")}
          id="partner-school-province"
          className={inputClass}
          aria-invalid={!!errors.provinceCode}
          aria-describedby={
            errors.provinceCode ? "partner-school-province-error" : undefined
          }
        >
          <option value="">请选择省级地区</option>
          {PROVINCES.map((province) => (
            <option key={province.code} value={province.code}>
              {province.name}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-sm leading-6 text-slate-500">
        学校添加后，可继续创建该校的管理员。校徽和校名图片可由学校管理员登录后在“系统配置”中上传。
      </p>
      {error ? (
        <p
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 border-t border-sky-100 pt-5">
        <button type="submit" className={submitClass} disabled={isSubmitting}>
          {isSubmitting ? "正在添加…" : "添加合作学校"}
        </button>
        <Link href="/super-admin/schools" className="text-sm text-slate-500">
          取消
        </Link>
      </div>
    </form>
  );
}

export function CreateSchoolAdminForm({
  schools,
  initialSchoolId,
}: {
  schools: SchoolOption[];
  initialSchoolId: string;
}) {
  const router = useRouter();
  const [created, setCreated] = useState<CreatedSchoolAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateSchoolAdminInput, unknown, CreateSchoolAdminData>({
    resolver: zodResolver(createSchoolAdminSchema),
    defaultValues: {
      schoolId: initialSchoolId,
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });
  const submit = handleSubmit(async (input) => {
    setError(null);
    const result = await requestAdminApi<CreatedSchoolAdmin>(
      "/api/super-admin/administrators",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!result.success) {
      setError(result.error);
      for (const field of [
        "schoolId",
        "displayName",
        "email",
        "password",
        "confirmPassword",
      ] as const) {
        const message = result.fieldErrors?.[field]?.[0];
        if (message) setFieldError(field, { message });
      }
      return;
    }
    reset();
    setCreated(result.data);
    router.refresh();
  });
  if (schools.length === 0)
    return (
      <section className="rounded-xl border border-dashed border-sky-200 bg-white p-8 text-center">
        <h2 className="font-semibold">请先添加合作学校</h2>
        <p className="mt-2 text-sm text-slate-500">
          高校管理员必须绑定一所已存在的合作学校。
        </p>
        <Link
          href="/super-admin/schools/new-school"
          className={`${submitClass} mt-5 inline-block`}
        >
          添加合作学校
        </Link>
      </section>
    );
  if (created)
    return (
      <section
        className="rounded-xl border border-emerald-200 bg-white p-6"
        role="status"
      >
        <h2 className="text-lg font-semibold text-emerald-800">
          管理员账号已创建
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[6rem_1fr]">
          <dt className="text-slate-500">管理员</dt>
          <dd>{created.displayName}</dd>
          <dt className="text-slate-500">登录邮箱</dt>
          <dd>{created.email}</dd>
          <dt className="text-slate-500">绑定学校</dt>
          <dd>{created.school.name}</dd>
        </dl>
        <p className="mt-5 text-sm leading-6 text-slate-500">
          请将设置的初始密码交付给管理员本人。账号从“管理员入口”登录，首次登录需要修改密码。
        </p>
        <Link
          className={`${submitClass} mt-6 inline-block`}
          href="/super-admin/schools?view=ADMINS"
        >
          返回管理员列表
        </Link>
      </section>
    );
  return (
    <form
      onSubmit={submit}
      noValidate
      className="max-w-3xl space-y-6 rounded-xl border border-sky-100 bg-white p-6"
    >
      <Field
        id="new-admin-school"
        label="绑定合作学校"
        error={errors.schoolId?.message}
      >
        <select
          {...register("schoolId")}
          id="new-admin-school"
          className={inputClass}
          aria-invalid={!!errors.schoolId}
          aria-describedby={
            errors.schoolId ? "new-admin-school-error" : undefined
          }
        >
          <option value="">请选择已有合作学校</option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
        <Link
          href="/super-admin/schools/new-school"
          className="mt-2 inline-block text-xs text-sky-700 underline"
        >
          找不到学校？先添加合作学校
        </Link>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="new-admin-name"
          label="管理员姓名"
          error={errors.displayName?.message}
        >
          <input
            {...register("displayName")}
            id="new-admin-name"
            className={inputClass}
            autoComplete="off"
            maxLength={50}
            placeholder="请输入管理员姓名"
            aria-invalid={!!errors.displayName}
            aria-describedby={
              errors.displayName ? "new-admin-name-error" : undefined
            }
          />
        </Field>
        <Field
          id="new-admin-email"
          label="登录邮箱"
          error={errors.email?.message}
        >
          <input
            {...register("email")}
            id="new-admin-email"
            className={inputClass}
            autoComplete="off"
            type="email"
            maxLength={254}
            placeholder="admin@university.edu.cn"
            aria-invalid={!!errors.email}
            aria-describedby={
              errors.email ? "new-admin-email-error" : undefined
            }
          />
        </Field>
        <Field
          id="new-admin-password"
          label="初始密码"
          error={errors.password?.message}
        >
          <input
            {...register("password")}
            id="new-admin-password"
            className={inputClass}
            autoComplete="new-password"
            type="password"
            aria-invalid={!!errors.password}
            aria-describedby={
              errors.password
                ? "new-admin-password-error"
                : "new-admin-password-hint"
            }
          />
        </Field>
        <Field
          id="new-admin-confirm"
          label="确认初始密码"
          error={errors.confirmPassword?.message}
        >
          <input
            {...register("confirmPassword")}
            id="new-admin-confirm"
            className={inputClass}
            autoComplete="new-password"
            type="password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={
              errors.confirmPassword ? "new-admin-confirm-error" : undefined
            }
          />
        </Field>
      </div>
      <p
        id="new-admin-password-hint"
        className="text-sm leading-6 text-slate-500"
      >
        初始密码至少 8
        位，包含大写字母、小写字母和数字。新账号固定为高校管理员，首次登录需修改密码。
      </p>
      {error ? (
        <p
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 border-t border-sky-100 pt-5">
        <button type="submit" className={submitClass} disabled={isSubmitting}>
          {isSubmitting ? "正在创建…" : "创建并绑定管理员"}
        </button>
        <Link
          href="/super-admin/schools?view=ADMINS"
          className="text-sm text-slate-500"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
