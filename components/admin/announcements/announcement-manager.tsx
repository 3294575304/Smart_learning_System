"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AnnouncementStatus, AnnouncementTargetType } from "@prisma/client";
import { Megaphone, Pencil, Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { requestAdminApi } from "@/components/admin/request-api";
import type {
  AnnouncementListResult,
  AnnouncementPublishResult,
  AnnouncementView,
} from "@/services/announcements/types";

const formSchema = z
  .object({
    title: z.string().trim().min(1, "请输入公告标题").max(100),
    content: z.string().trim().min(1, "请输入公告正文").max(2_000),
    targetType: z.nativeEnum(AnnouncementTargetType),
    expiresAt: z.string(),
  })
  .strict();

type FormValues = z.output<typeof formSchema>;

const TARGET_LABELS: Record<AnnouncementTargetType, string> = {
  ALL: "全部用户",
  ADMIN: "全部管理员",
  TEACHER: "全部教师",
  STUDENT: "全部学生",
};

function dateTimeLocalValue(value: Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatTime(value: Date | null): string {
  return value
    ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "—";
}

export function AnnouncementManager({
  initialResult,
}: {
  initialResult: AnnouncementListResult;
}) {
  const [result, setResult] = useState(initialResult);
  const [editing, setEditing] = useState<AnnouncementView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      content: "",
      targetType: AnnouncementTargetType.ALL,
      expiresAt: "",
    },
  });

  async function reload() {
    const response = await requestAdminApi<AnnouncementListResult>(
      "/api/admin/announcements?page=1&pageSize=20",
      { cache: "no-store" },
    );
    if (response.success) setResult(response.data);
    else setRequestError(response.error);
  }

  function stopEditing() {
    setEditing(null);
    form.reset({
      title: "",
      content: "",
      targetType: AnnouncementTargetType.ALL,
      expiresAt: "",
    });
  }

  function startEditing(announcement: AnnouncementView) {
    setEditing(announcement);
    setRequestError(null);
    setMessage(null);
    form.reset({
      title: announcement.title,
      content: announcement.content,
      targetType: announcement.targetType,
      expiresAt: dateTimeLocalValue(announcement.expiresAt),
    });
  }

  const submit = form.handleSubmit(async (values) => {
    setRequestError(null);
    setMessage(null);
    const endpoint = editing
      ? `/api/admin/announcements/${editing.id}`
      : "/api/admin/announcements";
    const response = await requestAdminApi<AnnouncementView>(endpoint, {
      method: editing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...values,
        expiresAt: values.expiresAt
          ? new Date(values.expiresAt).toISOString()
          : null,
      }),
    });
    if (!response.success) {
      setRequestError(response.error);
      return;
    }
    setMessage(editing ? "公告草稿已更新。" : "公告草稿已创建。");
    stopEditing();
    await reload();
  });

  async function publish(announcement: AnnouncementView) {
    if (!window.confirm(`确认发布公告“${announcement.title}”吗？`)) return;
    setPendingId(announcement.id);
    setRequestError(null);
    setMessage(null);
    const response = await requestAdminApi<AnnouncementPublishResult>(
      `/api/admin/announcements/${announcement.id}/publish`,
      { method: "POST" },
    );
    setPendingId(null);
    if (!response.success) {
      setRequestError(response.error);
      return;
    }
    setMessage(
      response.data.alreadyPublished
        ? "公告此前已发布，本次未重复发送通知。"
        : `公告已发布，创建 ${response.data.createdNotificationCount} 条站内通知。`,
    );
    await reload();
  }

  return (
    <div className="space-y-6">
      <form className="rounded-xl border bg-white p-5" onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {editing ? "编辑公告草稿" : "创建公告草稿"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              草稿不会发送通知，必须通过下方发布操作明确触发。
            </p>
          </div>
          {editing ? (
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={stopEditing}
              type="button"
            >
              取消编辑
            </button>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">标题</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              maxLength={100}
              {...form.register("title")}
            />
            <span className="text-xs text-red-600">
              {form.formState.errors.title?.message}
            </span>
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">正文（纯文本）</span>
            <textarea
              className="min-h-32 w-full rounded-md border px-3 py-2"
              maxLength={2_000}
              {...form.register("content")}
            />
            <span className="text-xs text-red-600">
              {form.formState.errors.content?.message}
            </span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">通知目标</span>
            <select
              className="w-full rounded-md border bg-white px-3 py-2"
              {...form.register("targetType")}
            >
              {Object.values(AnnouncementTargetType).map((target) => (
                <option key={target} value={target}>
                  {TARGET_LABELS[target]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">过期时间（可选）</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              type="datetime-local"
              {...form.register("expiresAt")}
            />
          </label>
        </div>
        <button
          className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {editing ? "保存修改" : "保存草稿"}
        </button>
      </form>

      {requestError ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {requestError}
        </div>
      ) : null}
      {message ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          {message}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">公告记录</h2>
          <span className="text-sm text-gray-500">
            共 {result.pagination.total} 条
          </span>
        </div>
        {result.items.length === 0 ? (
          <div className="rounded-xl border bg-white py-12 text-center">
            <Megaphone className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-3 text-sm text-gray-600">尚未创建系统公告</p>
          </div>
        ) : (
          result.items.map((announcement) => (
            <article
              className="rounded-xl border bg-white p-5"
              key={announcement.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{announcement.title}</h3>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                      {announcement.status === AnnouncementStatus.DRAFT
                        ? "草稿"
                        : "已发布"}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                      {TARGET_LABELS[announcement.targetType]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-gray-600">
                    {announcement.content}
                  </p>
                  <p className="mt-3 text-xs text-gray-500">
                    创建：{formatTime(announcement.createdAt)} · 发布：
                    {formatTime(announcement.publishedAt)} · 过期：
                    {formatTime(announcement.expiresAt)}
                  </p>
                </div>
                {announcement.status === AnnouncementStatus.DRAFT ? (
                  <div className="flex shrink-0 gap-2">
                    <button
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm"
                      onClick={() => startEditing(announcement)}
                      type="button"
                    >
                      <Pencil className="h-4 w-4" /> 编辑
                    </button>
                    <button
                      className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                      disabled={pendingId === announcement.id}
                      onClick={() => void publish(announcement)}
                      type="button"
                    >
                      <Send className="h-4 w-4" /> 发布
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
