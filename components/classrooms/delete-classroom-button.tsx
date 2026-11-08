"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Trash2 } from "lucide-react";
import { EditorDialog } from "@/components/assignments/editor-dialog";
import { requestApi } from "./request-api";
import type { ClassroomDeletionPreview } from "@/services/classrooms/deletion";

export function DeleteClassroomButton({
  classroomId,
  onDeleted,
  menu = false,
}: {
  classroomId: string;
  onDeleted?: (id: string) => void;
  menu?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ClassroomDeletionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [retry, setRetry] = useState(0);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setPreview(null);
    setError("");
    setAcknowledged(false);
    void requestApi<ClassroomDeletionPreview>(
      `/api/teacher/classrooms/${classroomId}/deletion`,
      { cache: "no-store", signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return;
      if (result.success) setPreview(result.data);
      else setError(result.error);
      setLoading(false);
    });
    return () => controller.abort();
  }, [open, classroomId, retry]);
  async function remove() {
    if (!preview || !acknowledged || preview.blockedReason || inFlight.current)
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const result = await requestApi<{ id: string }>(
      `/api/teacher/classrooms/${classroomId}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DELETE_CLASSROOM",
          confirmed: true,
          confirmedName: preview.name,
          token: preview.token,
          reason,
        }),
      },
    );
    inFlight.current = false;
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setDone(true);
    onDeleted?.(classroomId);
    window.location.assign("/teacher/classrooms?deleted=1");
  }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setReason("");
          setDone(false);
        }}
        className={
          menu
            ? "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-600"
            : "inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-600"
        }
      >
        <Trash2 aria-hidden="true" className="size-4" />
        删除班级
      </button>
      {open && (
        <EditorDialog
          open
          title="确认删除班级"
          busy={busy}
          onClose={() => {
            if (!inFlight.current) setOpen(false);
          }}
        >
          <div className="mt-4 space-y-4 text-sm">
            {done ? (
              <p role="status" className="text-emerald-700">
                班级已删除，相关历史记录已保留。
              </p>
            ) : (
              <>
                {loading ? (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-slate-600"
                  >
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    正在核对班级及关联记录…
                  </p>
                ) : null}
                {preview && (
                  <>
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-4">
                      <dt className="text-slate-500">班级</dt>
                      <dd className="font-medium break-words">
                        {preview.name}
                      </dd>
                      <dt className="text-slate-500">课程</dt>
                      <dd>{preview.courseName ?? "未关联课程"}</dd>
                      <dt className="text-slate-500">成员</dt>
                      <dd>
                        {preview.memberCount} 名在读 · {preview.pendingCount}{" "}
                        名待认领
                      </dd>
                      <dt className="text-slate-500">关联记录</dt>
                      <dd>
                        {preview.assignmentCount} 份作业／试卷 ·{" "}
                        {preview.teachingRecordCount} 项其他教学记录
                      </dd>
                    </dl>
                    <ul className="list-disc space-y-2 ps-5 text-slate-600">
                      <li>
                        班级从日常管理与开课列表移除，邀请码失效，学生停止访问本班。
                      </li>
                      <li>
                        成员关系转为历史记录，待认领预分配撤回；学生账号及其他班级不受影响。
                      </li>
                      <li>
                        作业、作答、成绩、出勤及报告等历史记录保留，已生成快照不改写；相关作业仅供查看。
                      </li>
                    </ul>
                    {preview.blockedReason ? (
                      <div
                        role="status"
                        className="rounded-lg bg-amber-50 p-3 text-amber-900"
                      >
                        {preview.blockedReason}
                        <a
                          className="mt-2 block underline"
                          href={`/teacher/classrooms/${classroomId}`}
                        >
                          进入班级处理
                        </a>
                      </div>
                    ) : (
                      <>
                        <label className="block text-slate-600">
                          删除原因（选填）
                          <textarea
                            maxLength={500}
                            disabled={busy}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="mt-1 min-h-20 w-full rounded-lg border bg-white p-3"
                          />
                        </label>
                        <p className="text-rose-700">
                          删除后暂不提供自助恢复入口，请确认不再使用本班开展教学。
                        </p>
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={acknowledged}
                            disabled={busy}
                            onChange={(e) => setAcknowledged(e.target.checked)}
                          />
                          <span>我已了解删除影响，确认删除此班级。</span>
                        </label>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-lg bg-rose-50 p-3 text-rose-700"
              >
                {error}
                <button
                  type="button"
                  disabled={busy || loading}
                  className="ms-2 underline"
                  onClick={() => setRetry((n) => n + 1)}
                >
                  重新核对
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t pt-4">
              {done ? (
                <Link
                  href="/teacher/classrooms?deleted=1"
                  className="rounded-lg bg-sky-700 px-4 py-2 text-white"
                >
                  返回班级列表
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                    className="h-10 rounded-lg border px-4 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      loading ||
                      !preview ||
                      !!preview.blockedReason ||
                      !acknowledged ||
                      !!error
                    }
                    onClick={() => void remove()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-700 px-4 font-medium text-white hover:bg-rose-800 disabled:opacity-50"
                  >
                    {busy && (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    )}
                    {busy ? "删除中…" : "确认删除班级"}
                  </button>
                </>
              )}
            </div>
          </div>
        </EditorDialog>
      )}
    </>
  );
}
