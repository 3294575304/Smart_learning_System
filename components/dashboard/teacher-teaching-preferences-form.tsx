"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { requestApi } from "@/components/courses/request-api";
import {
  teacherTeachingPreferencesSchema,
  type TeacherTeachingPreferences,
} from "@/services/dashboard/teacher-settings-schemas";
import { FOCUS_RING } from "./ui-focus";

export function TeacherTeachingPreferencesForm({
  initial,
  platformDueDays,
}: {
  initial: TeacherTeachingPreferences;
  platformDueDays: number;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [days, setDays] = useState(String(initial.assignmentDueDays ?? ""));
  const [allowResubmission, setAllowResubmission] = useState(
    initial.allowAssignmentResubmission,
  );
  const [notifyReportReady, setNotifyReportReady] = useState(
    initial.notifyQualityReportReady,
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const dirty =
    days !== String(saved.assignmentDueDays ?? "") ||
    allowResubmission !== saved.allowAssignmentResubmission ||
    notifyReportReady !== saved.notifyQualityReportReady;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !dirty) return;
    const input = teacherTeachingPreferencesSchema.safeParse({
      assignmentDueDays: days === "" ? null : Number(days),
      allowAssignmentResubmission: allowResubmission,
      notifyQualityReportReady: notifyReportReady,
    });
    if (!input.success) {
      setError("截止天数请输入 1 至 365 之间的整数。");
      return;
    }
    setSaving(true);
    const result = await requestApi<{
      teachingPreferences: TeacherTeachingPreferences;
    }>("/api/teacher/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teachingPreferences: input.data }),
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSaved(result.data.teachingPreferences);
    setDays(String(result.data.teachingPreferences.assignmentDueDays ?? ""));
    setStatus("教学偏好已保存。");
    router.refresh();
  }

  return (
    <section
      className="border-border bg-card min-w-0 rounded-xl border p-5 md:col-span-2"
      aria-labelledby="teacher-teaching-preferences"
    >
      <h2 id="teacher-teaching-preferences" className="text-base font-semibold">
        教学偏好
      </h2>
      <form
        onSubmit={save}
        onChange={() => {
          setStatus("");
          setError("");
        }}
      >
        <fieldset
          disabled={saving}
          className="mt-4 grid min-w-0 gap-5 md:grid-cols-2"
        >
          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold">作业发布默认值</h3>
            <p className="text-muted-foreground text-xs leading-5">
              新建作业时预填，具体截止时间和提交规则可逐份调整。
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label className="text-sm" htmlFor="teacher-assignment-due-days">
                默认截止天数
              </label>
              <input
                id="teacher-assignment-due-days"
                aria-describedby="teacher-assignment-due-days-hint"
                type="number"
                min={1}
                max={365}
                step={1}
                placeholder={String(platformDueDays)}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                className={`border-border bg-background h-10 w-24 rounded-lg border px-3 text-sm ${FOCUS_RING}`}
              />
            </div>
            <p
              id="teacher-assignment-due-days-hint"
              className="text-muted-foreground text-xs leading-5"
            >
              留空使用平台默认值（当前 {platformDueDays} 天）。
            </p>
            <label className="flex min-h-10 w-fit cursor-pointer items-center gap-2 text-sm">
              <input
                checked={allowResubmission}
                onChange={(event) => setAllowResubmission(event.target.checked)}
                type="checkbox"
                className={`size-4 shrink-0 accent-sky-700 ${FOCUS_RING}`}
              />
              默认允许重复提交
            </label>
          </div>

          <div className="border-border min-w-0 space-y-2 border-t pt-4 md:border-s md:border-t-0 md:ps-5 md:pt-0">
            <h3 className="text-sm font-semibold">通知偏好</h3>
            <label className="flex min-h-10 w-fit cursor-pointer items-center gap-2 text-sm">
              <input
                checked={notifyReportReady}
                onChange={(event) => setNotifyReportReady(event.target.checked)}
                type="checkbox"
                className={`size-4 shrink-0 accent-sky-700 ${FOCUS_RING}`}
              />
              接收教学质量报告待审核通知
            </label>
            <p className="text-muted-foreground text-xs leading-5">
              初稿可在报告页面查看。报告生成失败时仍会收到站内通知。
            </p>
          </div>
        </fieldset>

        <div className="border-border mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4">
          <button
            type="submit"
            disabled={!dirty || saving}
            className={`min-h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-55 ${FOCUS_RING}`}
          >
            {saving ? "保存中…" : "保存教学偏好"}
          </button>
          <div role="status" className="text-sm text-emerald-800">
            {status}
          </div>
          <div role="alert" className="text-sm text-red-700">
            {error}
          </div>
        </div>
      </form>
    </section>
  );
}
