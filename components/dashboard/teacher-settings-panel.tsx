"use client";

import { KeyRound, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";
import { requestApi } from "@/components/courses/request-api";
import {
  resetTeacherAssistantPosition,
  useTeacherAssistantVisibility,
} from "@/components/courses/teacher-assistant-preferences";
import { FOCUS_RING } from "./ui-focus";
import { TeacherTeachingPreferencesForm } from "./teacher-teaching-preferences-form";
import type { TeacherTeachingPreferences } from "@/services/dashboard/teacher-settings-schemas";

const panel = "min-w-0 rounded-xl border border-border bg-card p-5";
const secondaryButton = `inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-sky-800 hover:bg-sky-50 ${FOCUS_RING}`;

export function TeacherSettingsPanel({
  account,
  courses,
  initialCourseId,
  teachingPreferences,
  platformDueDays,
  teacherId,
  assistantEnabled,
}: {
  account: { label: string; value: string }[];
  courses: { id: string; name: string; term: string }[];
  initialCourseId: string | null;
  teachingPreferences: TeacherTeachingPreferences;
  platformDueDays: number;
  teacherId: string;
  assistantEnabled: boolean;
}) {
  const router = useRouter();
  const passwordTrigger = useRef<HTMLButtonElement>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [savedCourseId, setSavedCourseId] = useState(initialCourseId ?? "");
  const [courseId, setCourseId] = useState(initialCourseId ?? "");
  const [saving, setSaving] = useState(false);
  const [courseError, setCourseError] = useState("");
  const [courseStatus, setCourseStatus] = useState("");
  const [assistantStatus, setAssistantStatus] = useState("");
  const { visible, setVisible } = useTeacherAssistantVisibility(teacherId);

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || courseId === savedCourseId) return;
    setSaving(true);
    setCourseError("");
    setCourseStatus("");
    const result = await requestApi<{ defaultCourseId: string | null }>(
      "/api/teacher/settings",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultCourseId: courseId || null }),
      },
    );
    setSaving(false);
    if (!result.success) {
      setCourseError(result.error);
      return;
    }
    setSavedCourseId(result.data.defaultCourseId ?? "");
    setCourseStatus("默认课程已保存。");
    router.refresh();
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section
        className={`${panel} md:col-span-2`}
        aria-labelledby="teacher-account"
      >
        <h2 id="teacher-account" className="text-base font-semibold">
          账号信息
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {account.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="mt-1 text-sm font-medium wrap-anywhere">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground text-sm">
            账号资料由学校管理员维护。
          </p>
          <button
            className={secondaryButton}
            onClick={() => setPasswordOpen(true)}
            ref={passwordTrigger}
            type="button"
          >
            <KeyRound aria-hidden="true" className="size-4" />
            修改密码
          </button>
        </div>
      </section>

      <section className={panel} aria-labelledby="teacher-workbench-settings">
        <h2 id="teacher-workbench-settings" className="text-base font-semibold">
          教师工作台
        </h2>
        <form className="mt-4" onSubmit={saveCourse}>
          <label
            htmlFor="teacher-default-course"
            className="text-sm font-medium"
          >
            默认课程
          </label>
          <select
            id="teacher-default-course"
            aria-describedby="teacher-default-course-hint"
            className={`border-border bg-background mt-2 h-10 w-full rounded-lg border px-3 text-sm ${FOCUS_RING}`}
            disabled={!courses.length || saving}
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setCourseError("");
              setCourseStatus("");
            }}
          >
            <option value="">自动选择最近更新的课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.term}
              </option>
            ))}
          </select>
          <p
            id="teacher-default-course-hint"
            className="text-muted-foreground mt-2 text-xs leading-5"
          >
            {courses.length
              ? "从工作台进入时使用，随账号保存。"
              : "创建课程后即可设置默认课程。"}
          </p>
          <button
            type="submit"
            disabled={saving || courseId === savedCourseId}
            className={`mt-4 min-h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-55 ${FOCUS_RING}`}
          >
            {saving ? "保存中…" : "保存默认课程"}
          </button>
          <div
            role="status"
            className="mt-2 text-sm text-emerald-800 empty:mt-0"
          >
            {courseStatus}
          </div>
          <div role="alert" className="mt-2 text-sm text-red-700 empty:mt-0">
            {courseError}
          </div>
        </form>
      </section>

      <section className={panel} aria-labelledby="teacher-assistant-settings">
        <h2 id="teacher-assistant-settings" className="text-base font-semibold">
          教师 AI 助手
        </h2>
        {assistantEnabled ? (
          <>
            <label className="mt-3 flex min-h-10 w-fit cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                className={`size-4 accent-sky-700 ${FOCUS_RING}`}
                type="checkbox"
                checked={visible}
                onChange={(event) => {
                  const next = event.target.checked;
                  setAssistantStatus(
                    setVisible(next)
                      ? next
                        ? "助手已显示。"
                        : "助手已隐藏。"
                      : "浏览器暂时无法保存助手设置。",
                  );
                }}
              />
              显示悬浮助手
            </label>
            <p className="text-muted-foreground mt-1 text-xs leading-5">
              显示状态和位置保存在当前浏览器。
            </p>
            <button
              className={`${secondaryButton} mt-4`}
              type="button"
              onClick={() =>
                setAssistantStatus(
                  resetTeacherAssistantPosition(teacherId)
                    ? "助手位置已重置。"
                    : "浏览器暂时无法保存助手位置。",
                )
              }
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              重置助手位置
            </button>
            <p
              role="status"
              className="text-muted-foreground mt-2 text-sm empty:mt-0"
            >
              {assistantStatus}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            当前平台未启用教师 AI 助手。
          </p>
        )}
      </section>

      <TeacherTeachingPreferencesForm
        initial={teachingPreferences}
        platformDueDays={platformDueDays}
      />

      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => {
          setPasswordOpen(false);
          passwordTrigger.current?.focus();
        }}
      />
    </div>
  );
}
