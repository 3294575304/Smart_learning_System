"use client";

import { CourseSurveyMode, CourseSurveyStatus } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { requestCourseSurveyApi } from "@/components/course-surveys/request";

interface SurveyItem {
  id: string;
  title: string;
  status: CourseSurveyStatus;
  mode: CourseSurveyMode;
  opensAt: string | Date;
  dueAt: string | Date;
  classroom: { id: string; name: string };
  _count: { responses: number; participations: number };
  summaryRevisions: Array<{
    responseCount: number;
    eligibleCount: number;
    isSuppressed: boolean;
  }>;
}

function localInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

const STATUS_LABELS: Record<CourseSurveyStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CLOSED: "已关闭",
  ARCHIVED: "已归档",
};

export function SurveyListWorkspace({
  courseId,
  classrooms,
  initialSurveys,
}: {
  courseId: string;
  classrooms: Array<{ id: string; name: string }>;
  initialSurveys: SurveyItem[];
}) {
  const router = useRouter();
  const defaults = useMemo(() => {
    const opensAt = new Date();
    opensAt.setMinutes(opensAt.getMinutes() + 10);
    const dueAt = new Date(opensAt.getTime() + 7 * 86_400_000);
    return { opensAt: localInput(opensAt), dueAt: localInput(dueAt) };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function create(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await requestCourseSurveyApi<{ id: string }>(
        `/api/teacher/courses/${courseId}/surveys`,
        {
          method: "POST",
          body: JSON.stringify({
            classroomId: data.get("classroomId"),
            title: data.get("title"),
            description: data.get("description"),
            instructions: "本问卷不计入课程成绩，请根据真实学习体验作答。",
            mode: data.get("mode"),
            opensAt: data.get("opensAt"),
            dueAt: data.get("dueAt"),
          }),
        },
      );
      setSuccess("已根据当前正式教学大纲生成问卷草稿。");
      router.push(`/teacher/courses/${courseId}/surveys/${created.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        className="space-y-4 rounded-xl border bg-white p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void create(event.currentTarget);
        }}
      >
        <div>
          <h2 className="font-semibold">从正式大纲生成问卷草稿</h2>
          <p className="mt-1 text-sm text-gray-600">
            自动生成课程目标自评、教学质量五级量表和开放题，发布前可逐题审核。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>目标班级</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              name="classroomId"
              required
            >
              <option value="">请选择</option>
              {classrooms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>收集模式</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              defaultValue="ANONYMOUS"
              name="mode"
            >
              <option value="ANONYMOUS">匿名（推荐）</option>
              <option value="IDENTIFIED">实名</option>
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>问卷名称</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              defaultValue="Python 程序设计结课教学质量自评问卷"
              name="title"
              required
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>说明</span>
            <textarea
              className="min-h-20 w-full rounded-md border px-3 py-2"
              defaultValue="用于课程目标达成自评和教学持续改进，不计入课程成绩。"
              name="description"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>开放时间</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              defaultValue={defaults.opensAt}
              name="opensAt"
              type="datetime-local"
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>截止时间</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              defaultValue={defaults.dueAt}
              name="dueAt"
              type="datetime-local"
              required
            />
          </label>
        </div>
        {error ? (
          <p
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy || classrooms.length === 0}
          type="submit"
        >
          {busy ? "正在生成…" : "生成草稿"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="font-semibold">课程问卷</h2>
        {initialSurveys.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-gray-500">
            尚未创建问卷。发布正式大纲并关联班级后即可生成。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {initialSurveys.map((survey) => {
              const summary = survey.summaryRevisions[0];
              return (
                <Link
                  className="rounded-xl border bg-white p-5 transition-colors hover:bg-gray-50"
                  href={`/teacher/courses/${courseId}/surveys/${survey.id}`}
                  key={survey.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{survey.title}</h3>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">
                      {STATUS_LABELS[survey.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {survey.classroom.name} ·{" "}
                    {survey.mode === "ANONYMOUS" ? "匿名" : "实名"} ·{" "}
                    {survey._count.participations} 份回答
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(survey.opensAt).toLocaleString("zh-CN")} 至{" "}
                    {new Date(survey.dueAt).toLocaleString("zh-CN")}
                  </p>
                  {summary ? (
                    <p className="mt-3 text-sm">
                      响应率{" "}
                      {summary.eligibleCount
                        ? (
                            (summary.responseCount / summary.eligibleCount) *
                            100
                          ).toFixed(1)
                        : "0.0"}
                      %{summary.isSuppressed ? " · 小样本保护中" : ""}
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
