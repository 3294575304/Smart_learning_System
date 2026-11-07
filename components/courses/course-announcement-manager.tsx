"use client";

import { AnnouncementStatus } from "@prisma/client";
import {
  Copy,
  LoaderCircle,
  Megaphone,
  Pencil,
  Send,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { EditorDialog } from "@/components/assignments/editor-dialog";
import { requestApi } from "@/components/courses/request-api";
import { toast } from "@/components/ui/toast";
import {
  SECTION_TABS_LIST,
  sectionTabClass,
} from "@/components/ui/section-tabs";
import type {
  CourseAnnouncementAudience,
  CourseAnnouncementBatchResult,
  CourseAnnouncementCreateResult,
  CourseAnnouncementListResult,
  CourseAnnouncementPublishResult,
  CourseAnnouncementView,
} from "@/services/course-announcements/types";
import type { ActionResult } from "@/types/action-result";

type StatusFilter = "" | AnnouncementStatus;

const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  REVOKED: "已撤回",
};

const STATUS_CLASS: Record<AnnouncementStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-200/70",
  PUBLISHED: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
  REVOKED: "bg-stone-100 text-stone-600 ring-stone-200",
};

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "", label: "全部" },
  { value: AnnouncementStatus.DRAFT, label: "草稿" },
  { value: AnnouncementStatus.PUBLISHED, label: "已发布" },
  { value: AnnouncementStatus.REVOKED, label: "已撤回" },
];

const ACTION_LINK =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-sky-200/80 bg-sky-50 px-3 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 active:scale-[0.97] active:bg-sky-200/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-wait disabled:opacity-50";

const ACTION_MUTED =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 active:scale-[0.97] active:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-wait disabled:opacity-50";

const FIELD =
  "w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

function formatTime(value: Date | string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function formatExpiry(value: Date | string | null, status: AnnouncementStatus) {
  if (status === AnnouncementStatus.DRAFT) return "未发布";
  if (!value) return "不过期";
  return `${formatTime(value)} 过期`;
}

export function CourseAnnouncementManager({
  courseId,
  classrooms,
  initialClassroomId,
  initialResult,
}: {
  courseId: string;
  classrooms: Array<{ id: string; name: string }>;
  initialClassroomId: string;
  initialResult: CourseAnnouncementListResult;
}) {
  const [result, setResult] = useState(initialResult);
  const [status, setStatus] = useState<StatusFilter>("");
  const [classroomId, setClassroomId] = useState(initialClassroomId);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CourseAnnouncementView | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<string[]>(
    [],
  );
  const [audience, setAudience] = useState<CourseAnnouncementAudience | null>(
    null,
  );
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const load = useCallback(
    async (nextStatus: StatusFilter, nextClassroomId: string) => {
      setLoading(true);
      const params = new URLSearchParams({ courseId });
      if (nextClassroomId) params.set("classroomId", nextClassroomId);
      if (nextStatus) params.set("status", nextStatus);
      const response = await requestApi<CourseAnnouncementListResult>(
        `/api/teacher/course-announcements?${params.toString()}`,
        { cache: "no-store" },
      );
      setLoading(false);
      if (response.success) {
        setResult(response.data);
        setError(null);
        return;
      }
      setError(response.error);
    },
    [courseId],
  );

  useEffect(() => {
    if (!open || selectedClassroomIds.length === 0) {
      setAudience(null);
      return;
    }
    let active = true;
    setAudience(null);
    setAudienceError(null);
    const params = new URLSearchParams({
      courseId,
      classroomIds: selectedClassroomIds.join(","),
    });
    void requestApi<CourseAnnouncementAudience>(
      `/api/teacher/course-announcements/audience?${params.toString()}`,
      { cache: "no-store" },
    ).then((response) => {
      if (!active) return;
      if (response.success) setAudience(response.data);
      else setAudienceError(response.error);
    });
    return () => {
      active = false;
    };
  }, [courseId, open, selectedClassroomIds]);

  function resetForm() {
    setTitle("");
    setContent("");
    setExpiresInDays("7");
    setSelectedClassroomIds(classroomId ? [classroomId] : []);
    setTouched(false);
    setError(null);
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(item: CourseAnnouncementView) {
    setEditing(item);
    setTitle(item.title);
    setContent(item.content);
    setExpiresInDays(item.expiresAt ? "7" : "0");
    setSelectedClassroomIds([item.classroom.id]);
    setTouched(false);
    setError(null);
    setOpen(true);
  }

  function openDuplicate(item: CourseAnnouncementView) {
    setEditing(null);
    setTitle(`${item.title}（副本）`);
    setContent(item.content);
    setExpiresInDays("7");
    setSelectedClassroomIds([item.classroom.id]);
    setTouched(false);
    setError(null);
    setOpen(true);
  }

  function toggleClassroom(id: string) {
    setSelectedClassroomIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }

  /** 相同内容二次确认：服务端返回 DUPLICATE_CONTENT 后带确认重试一次。 */
  async function withDuplicateRetry<T>(
    input: RequestInfo | URL,
    init: RequestInit,
  ): Promise<ActionResult<T>> {
    const first = await requestApi<T>(input, init);
    if (first.success || first.code !== "DUPLICATE_CONTENT") return first;
    if (!window.confirm("本班 24 小时内已发过相同内容，仍要再发一次吗？")) {
      return first;
    }
    const body = init.body ? JSON.parse(String(init.body)) : {};
    return requestApi<T>(input, {
      ...init,
      body: JSON.stringify({ ...body, confirmDuplicate: true }),
    });
  }

  async function publishById(id: string): Promise<boolean> {
    const response = await withDuplicateRetry<CourseAnnouncementPublishResult>(
      `/api/teacher/course-announcements/${id}/publish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    if (!response.success) {
      toast("error", response.error);
      return false;
    }
    toast(
      response.data.alreadyPublished ? "info" : "success",
      response.data.alreadyPublished
        ? "这条通知此前已发布，本次未重复发送。"
        : `已发送给 ${response.data.announcement.classroom.name} ${response.data.createdNotificationCount} 名学生。`,
    );
    return true;
  }

  async function save(publishNow: boolean) {
    setTouched(true);
    if (!title.trim() || !content.trim() || selectedClassroomIds.length === 0)
      return;
    setBusy(true);
    try {
      const expiresInDaysValue =
        expiresInDays === "" ? null : Number(expiresInDays);
      if (editing) {
        const patched = await requestApi<CourseAnnouncementView>(
          `/api/teacher/course-announcements/${editing.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title: title.trim(),
              content: content.trim(),
              classroomId: selectedClassroomIds[0],
              expiresInDays: expiresInDaysValue,
            }),
          },
        );
        if (!patched.success) {
          toast("error", patched.error);
          return;
        }
        if (publishNow) {
          if (!(await publishById(editing.id))) return;
        } else {
          toast("success", "草稿已保存。");
        }
      } else {
        const created =
          await withDuplicateRetry<CourseAnnouncementCreateResult>(
            "/api/teacher/course-announcements",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                title: title.trim(),
                content: content.trim(),
                classroomIds: selectedClassroomIds,
                expiresInDays: expiresInDaysValue,
                courseId,
                publish: publishNow,
              }),
            },
          );
        if (!created.success) {
          toast("error", created.error);
          return;
        }
        const names = created.data.announcements
          .map((item) => item.classroom.name)
          .join("、");
        toast(
          "success",
          publishNow
            ? `已发送给 ${names}，共 ${created.data.createdNotificationCount} 名学生。`
            : `已存为草稿（${names}），不会给学生发送通知。`,
        );
      }
      setOpen(false);
      await load(status, classroomId);
    } finally {
      setBusy(false);
    }
  }

  async function publish(item: CourseAnnouncementView) {
    if (
      !window.confirm(`确认发布「${item.title}」？发布后本班学生会收到通知。`)
    )
      return;
    setPendingId(item.id);
    const ok = await publishById(item.id);
    setPendingId(null);
    if (ok) await load(status, classroomId);
  }

  async function revoke(item: CourseAnnouncementView) {
    if (
      !window.confirm(
        `确认撤回「${item.title}」？未读学生会立即看不到这条通知，已读记录保留。`,
      )
    )
      return;
    setPendingId(item.id);
    const response = await requestApi<CourseAnnouncementPublishResult>(
      `/api/teacher/course-announcements/${item.id}/revoke`,
      { method: "POST" },
    );
    setPendingId(null);
    if (!response.success) {
      toast("error", response.error);
      return;
    }
    toast("success", "通知已撤回。");
    await load(status, classroomId);
  }

  async function remove(item: CourseAnnouncementView) {
    if (!window.confirm(`删除草稿「${item.title}」？删除后不可恢复。`)) return;
    setPendingId(item.id);
    const response = await requestApi<{ id: string }>(
      `/api/teacher/course-announcements/${item.id}`,
      { method: "DELETE" },
    );
    setPendingId(null);
    if (!response.success) {
      toast("error", response.error);
      return;
    }
    toast("success", "草稿已删除。");
    await load(status, classroomId);
  }

  async function revokeBatch(item: CourseAnnouncementView) {
    if (!item.batchId) return;
    const count = item.batchClassrooms.length + 1;
    if (
      !window.confirm(
        `确认整批撤回「${item.title}」？将撤回同批 ${count} 个班级的通知，未读记录立即删除，已读记录保留。`,
      )
    )
      return;
    setPendingId(item.batchId);
    const response = await requestApi<CourseAnnouncementBatchResult>(
      "/api/teacher/course-announcements/batch/revoke",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, batchId: item.batchId }),
      },
    );
    setPendingId(null);
    if (!response.success) {
      toast("error", response.error);
      return;
    }
    toast(
      "success",
      `已整批撤回 ${response.data.revoked.length} 个班级的通知。`,
    );
    await load(status, classroomId);
  }

  async function duplicateBatch(item: CourseAnnouncementView) {
    if (!item.batchId) return;
    setPendingId(item.batchId);
    const response = await requestApi<CourseAnnouncementCreateResult>(
      "/api/teacher/course-announcements/batch/duplicate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, batchId: item.batchId }),
      },
    );
    setPendingId(null);
    if (!response.success) {
      toast("error", response.error);
      return;
    }
    toast(
      "success",
      `已复制为草稿（${response.data.classroomCount} 个班级）。`,
    );
    await load(status, classroomId);
  }

  const titleError = touched && !title.trim() ? "请填写通知标题" : "";
  const contentError = touched && !content.trim() ? "请填写通知正文" : "";
  const canSubmit = Boolean(
    title.trim() && content.trim() && selectedClassroomIds.length > 0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          aria-label="按状态筛选通知"
          className={SECTION_TABS_LIST}
          role="group"
        >
          {FILTERS.map((filter) => (
            <button
              key={filter.value || "all"}
              aria-pressed={status === filter.value}
              className={sectionTabClass(status === filter.value)}
              onClick={() => {
                setStatus(filter.value);
                void load(filter.value, classroomId);
              }}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {classrooms.length > 1 ? (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>班级</span>
              <select
                aria-label="选择查看的班级"
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                onChange={(event) => {
                  setClassroomId(event.target.value);
                  void load(status, event.target.value);
                }}
                value={classroomId}
              >
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:scale-[0.97] active:bg-sky-800 disabled:opacity-50"
            disabled={classrooms.length === 0}
            onClick={openCreate}
            type="button"
          >
            <Megaphone aria-hidden="true" className="size-4" />
            写通知
          </button>
        </div>
      </div>

      {classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-600">
          这门课还没有班级，先创建班级才能发通知。
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {classrooms.length > 0 && result.items.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center">
          <Megaphone
            aria-hidden="true"
            className="mx-auto size-8 text-slate-300"
          />
          <p className="mt-3 text-sm text-slate-600">
            {status === ""
              ? "还没有课程通知。发一条，学生会在通知中心收到。"
              : "这个状态下没有通知。"}
          </p>
          {status === "" ? (
            <button
              className="mt-3 text-sm font-medium text-sky-700 underline underline-offset-4 transition hover:text-sky-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700 active:scale-95"
              onClick={openCreate}
              type="button"
            >
              写第一条通知
            </button>
          ) : (
            <button
              className="mt-3 text-sm font-medium text-sky-700 underline underline-offset-4"
              onClick={() => {
                setStatus("");
                void load("", classroomId);
              }}
              type="button"
            >
              查看全部
            </button>
          )}
        </div>
      ) : null}

      <ul aria-busy={loading} className="space-y-3">
        {result.items.map((item) => {
          const pending = pendingId === item.id;
          return (
            <li
              className="rounded-xl border border-sky-100 bg-white p-4 sm:p-5"
              key={item.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold break-words text-slate-900">
                      {item.title}
                    </h3>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_CLASS[item.status]}`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                    {item.batchClassrooms.length > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 ring-1 ring-orange-200/70 ring-inset">
                        <Users aria-hidden="true" className="size-3" />
                        同批 {item.batchClassrooms.length + 1} 个班级
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-6 break-words whitespace-pre-wrap text-slate-600">
                    {item.content}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{item.classroom.name}</span>
                    {item.batchClassrooms.length > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-400">
                          同批：
                          {item.batchClassrooms.map((c) => c.name).join("、")}
                        </span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span>
                      {item.status === AnnouncementStatus.DRAFT
                        ? `最后修改 ${formatTime(item.updatedAt)}`
                        : `${formatTime(item.publishedAt)} 发布`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatExpiry(item.expiresAt, item.status)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {item.status === AnnouncementStatus.DRAFT
                        ? `${item.audienceCount} 人待收`
                        : `已读 ${item.readCount}/${item.audienceCount}`}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  {item.status === AnnouncementStatus.DRAFT ? (
                    <>
                      <button
                        className={ACTION_MUTED}
                        onClick={() => openEdit(item)}
                        type="button"
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        编辑
                      </button>
                      <button
                        className={ACTION_LINK}
                        disabled={pending}
                        onClick={() => void publish(item)}
                        type="button"
                      >
                        {pending ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : (
                          <Send aria-hidden="true" className="size-4" />
                        )}
                        发布
                      </button>
                      <button
                        className={ACTION_MUTED}
                        disabled={pending}
                        onClick={() => void remove(item)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        删除
                      </button>
                      {item.batchClassrooms.length > 0 ? (
                        <button
                          className={ACTION_LINK}
                          disabled={pendingId === item.batchId}
                          onClick={() => void duplicateBatch(item)}
                          type="button"
                        >
                          <Copy aria-hidden="true" className="size-4" />
                          整批复制
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {item.status === AnnouncementStatus.PUBLISHED ? (
                    <>
                      <button
                        className={ACTION_MUTED}
                        disabled={pending}
                        onClick={() => void revoke(item)}
                        type="button"
                      >
                        {pending ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-4 animate-spin"
                          />
                        ) : (
                          <Undo2 aria-hidden="true" className="size-4" />
                        )}
                        撤回
                      </button>
                      {item.batchClassrooms.length > 0 ? (
                        <button
                          className={ACTION_MUTED}
                          disabled={pendingId === item.batchId}
                          onClick={() => void revokeBatch(item)}
                          type="button"
                        >
                          整批撤回
                        </button>
                      ) : null}
                      <button
                        className={ACTION_LINK}
                        onClick={() => openDuplicate(item)}
                        type="button"
                      >
                        <Copy aria-hidden="true" className="size-4" />
                        复制
                      </button>
                      {item.batchClassrooms.length > 0 ? (
                        <button
                          className={ACTION_LINK}
                          disabled={pendingId === item.batchId}
                          onClick={() => void duplicateBatch(item)}
                          type="button"
                        >
                          整批复制
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {item.status === AnnouncementStatus.REVOKED ? (
                    <>
                      <button
                        className={ACTION_MUTED}
                        onClick={() => openDuplicate(item)}
                        type="button"
                      >
                        <Copy aria-hidden="true" className="size-4" />
                        复制
                      </button>
                      {item.batchClassrooms.length > 0 ? (
                        <button
                          className={ACTION_LINK}
                          disabled={pendingId === item.batchId}
                          onClick={() => void duplicateBatch(item)}
                          type="button"
                        >
                          整批复制
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {result.items.length > 0 ? (
        <p className="text-xs text-slate-500">
          共 {result.pagination.total} 条记录
          {result.pagination.totalPages > 1
            ? ` · 第 ${result.pagination.page}/${result.pagination.totalPages} 页`
            : ""}
        </p>
      ) : null}

      <EditorDialog
        busy={busy}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        open={open}
        title={editing ? "编辑通知草稿" : "写通知"}
      >
        <div className="mt-4 space-y-4">
          <fieldset className="space-y-1 text-sm">
            <legend className="font-medium text-slate-800">
              目标班级
              <span className="ml-1 font-normal text-slate-400">
                可多选（已选 {selectedClassroomIds.length} 个）
              </span>
            </legend>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-sky-200 bg-white p-2">
              {classrooms.map((classroom) => {
                const checked = selectedClassroomIds.includes(classroom.id);
                return (
                  <label
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-sky-50"
                    key={classroom.id}
                  >
                    <input
                      checked={checked}
                      className="size-4 shrink-0 accent-sky-600"
                      onChange={() => toggleClassroom(classroom.id)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {classroom.name}
                    </span>
                  </label>
                );
              })}
            </div>
            {touched && selectedClassroomIds.length === 0 ? (
              <span className="block text-xs text-red-700" role="alert">
                请至少选择一个班级
              </span>
            ) : null}
          </fieldset>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-800">标题</span>
            <input
              aria-invalid={Boolean(titleError)}
              className={FIELD}
              maxLength={100}
              onBlur={() => setTouched(true)}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：本周三实验课改到机房 302"
              value={title}
            />
            {titleError ? (
              <span className="block text-xs text-red-700" role="alert">
                {titleError}
              </span>
            ) : null}
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-800">正文</span>
            <textarea
              aria-invalid={Boolean(contentError)}
              className={`${FIELD} min-h-32`}
              maxLength={2_000}
              onBlur={() => setTouched(true)}
              onChange={(event) => setContent(event.target.value)}
              placeholder="写清楚时间、地点和要带的东西。"
              value={content}
            />
            <span className="flex items-center justify-between text-xs text-slate-500">
              <span className="text-red-700">{contentError}</span>
              <span className="tabular-nums">{content.length}/2000</span>
            </span>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-800">有效期</span>
            <select
              className={FIELD}
              onChange={(event) => setExpiresInDays(event.target.value)}
              value={expiresInDays}
            >
              <option value="1">1 天后自动过期</option>
              <option value="7">7 天后自动过期</option>
              <option value="30">30 天后自动过期</option>
              <option value="0">不自动过期</option>
            </select>
          </label>

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            {audienceError
              ? audienceError
              : audience
                ? `共 ${audience.classrooms.length} 个班级、${audience.totalStudentCount} 名在读学生将收到通知。`
                : "正在统计收件人…"}
            {audience && audience.totalStudentCount === 0
              ? "所选班级均无在读学生，无法发布。"
              : ""}
          </p>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              className={ACTION_MUTED}
              disabled={busy}
              onClick={() => setOpen(false)}
              type="button"
            >
              取消
            </button>
            <button
              className={ACTION_MUTED}
              disabled={busy || !canSubmit}
              onClick={() => void save(false)}
              type="button"
            >
              {busy ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : null}
              存草稿
            </button>
            <button
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:scale-[0.97] active:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                busy ||
                !canSubmit ||
                (audience !== null && audience.totalStudentCount === 0)
              }
              onClick={() => void save(true)}
              type="button"
            >
              {busy ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <Send aria-hidden="true" className="size-4" />
              )}
              发布
            </button>
          </div>
        </div>
      </EditorDialog>
    </div>
  );
}
