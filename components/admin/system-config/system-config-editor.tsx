"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { requestAdminApi } from "@/components/admin/request-api";
import {
  systemConfigDefinitions,
  systemConfigValuesSchema,
  type SystemConfigKey,
  type SystemConfigValues,
} from "@/services/system-config/definitions";
import type {
  SystemConfigAdminView,
  SystemConfigCategoryView,
  SystemConfigUpdateResult,
} from "@/services/system-config/types";

interface CategoryFormProps {
  category: SystemConfigCategoryView;
  initialValues: SystemConfigValues;
  onReload: (view: SystemConfigAdminView) => void;
}

function fieldError(
  errors: ReturnType<typeof useForm<SystemConfigValues>>["formState"]["errors"],
  key: SystemConfigKey,
): string | null {
  const message = errors[key]?.message;
  return typeof message === "string" ? message : null;
}

function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const linkClick = (event: MouseEvent) => {
      const target = event.target;
      const link = target instanceof Element ? target.closest("a[href]") : null;
      if (!link || window.confirm("当前分类有未保存修改，确认离开吗？")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", linkClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", linkClick, true);
    };
  }, [isDirty]);
}

function ConfigCategoryForm({
  category,
  initialValues,
  onReload,
}: CategoryFormProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const form = useForm<SystemConfigValues>({
    resolver: zodResolver(systemConfigValuesSchema),
    defaultValues: initialValues,
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  useEffect(() => {
    if (!form.formState.isDirty) form.reset(initialValues);
  }, [form, initialValues]);

  const save = form.handleSubmit(async (values) => {
    setFeedback(null);
    const keys = category.items.map((item) => item.key);
    const updates = Object.fromEntries(keys.map((key) => [key, values[key]]));
    if (
      keys.includes("maintenanceMode") &&
      !initialValues.maintenanceMode &&
      values.maintenanceMode &&
      !window.confirm(
        "开启维护模式后，教师和学生将无法访问业务页面与接口。管理员仍可进入后台。确认开启吗？",
      )
    ) {
      return;
    }
    if (
      keys.includes("aiAnalysisEnabled") &&
      initialValues.aiAnalysisEnabled &&
      !values.aiAnalysisEnabled &&
      !window.confirm(
        "关闭后系统不会再调用 AI Provider，新的学情分析将使用规则能力。确认关闭吗？",
      )
    ) {
      return;
    }

    const updated = await requestAdminApi<SystemConfigUpdateResult>(
      "/api/admin/system-config",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      },
    );
    if (!updated.success) {
      setFeedback({ type: "error", message: updated.error });
      return;
    }

    const reloaded = await requestAdminApi<SystemConfigAdminView>(
      "/api/admin/system-config",
    );
    if (!reloaded.success) {
      setFeedback({
        type: "error",
        message: `配置已保存，但重新读取失败：${reloaded.error}`,
      });
      return;
    }
    form.reset(reloaded.data.values);
    onReload(reloaded.data);
    setFeedback({
      type: "success",
      message:
        updated.data.changedKeys.length === 0
          ? "配置未发生变化。"
          : "配置已保存并从服务端重新读取。",
    });
    router.refresh();
  });

  return (
    <form className="bg-card rounded-xl border p-5 sm:p-6" onSubmit={save}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-semibold">{category.label}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            本分类独立保存，不会提交其他分类的未保存内容。
          </p>
        </div>
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={form.formState.isSubmitting || !form.formState.isDirty}
          type="submit"
        >
          {form.formState.isSubmitting ? "保存中…" : "保存本分类"}
        </button>
      </div>

      <div className="mt-5 space-y-5">
        {category.items.map((item) => {
          const definition = systemConfigDefinitions[item.key];
          const error = fieldError(form.formState.errors, item.key);
          return (
            <div
              className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.3fr)] md:gap-6"
              key={item.key}
            >
              <div>
                <label className="text-sm font-medium" htmlFor={item.key}>
                  {item.label}
                </label>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  {item.description}
                </p>
              </div>
              <div>
                {definition.type === "BOOLEAN" ? (
                  <label
                    className="flex items-center gap-3 rounded-md border px-4 py-3 text-sm"
                    htmlFor={item.key}
                  >
                    <input
                      id={item.key}
                      type="checkbox"
                      {...form.register(item.key)}
                    />
                    {form.watch(item.key) ? "已开启" : "已关闭"}
                  </label>
                ) : definition.type === "TEXT" ? (
                  <textarea
                    className="min-h-24 w-full rounded-md border px-3 py-2 text-sm"
                    id={item.key}
                    {...form.register(item.key)}
                  />
                ) : (
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    id={item.key}
                    type={definition.type === "INTEGER" ? "number" : "text"}
                    {...form.register(item.key, {
                      valueAsNumber: definition.type === "INTEGER",
                    })}
                  />
                )}
                {error ? (
                  <p className="mt-1 text-sm text-red-600">{error}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {feedback ? (
        <p
          className={`mt-5 rounded-md p-3 text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
    </form>
  );
}

export function SystemConfigEditor({
  initialView,
}: {
  initialView: SystemConfigAdminView;
}) {
  const [metadata, setMetadata] = useState({
    updatedAt: initialView.updatedAt,
    updatedBy: initialView.updatedBy,
  });
  useEffect(() => {
    setMetadata({
      updatedAt: initialView.updatedAt,
      updatedBy: initialView.updatedBy,
    });
  }, [initialView.updatedAt, initialView.updatedBy]);

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        {metadata.updatedAt
          ? `最近更新：${new Date(metadata.updatedAt).toLocaleString("zh-CN")}${
              metadata.updatedBy ? ` · ${metadata.updatedBy.displayName}` : ""
            }`
          : "当前使用系统默认配置，尚无数据库更新记录。"}
      </p>
      {initialView.categories.map((category) => (
        <ConfigCategoryForm
          category={category}
          initialValues={initialView.values}
          key={category.key}
          onReload={(view) =>
            setMetadata({
              updatedAt: view.updatedAt,
              updatedBy: view.updatedBy,
            })
          }
        />
      ))}
    </div>
  );
}
