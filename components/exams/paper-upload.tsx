"use client";

import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { useState } from "react";

type DraftSummary = {
  id: string;
  title: string;
  sourceFileName: string;
  status: string;
  updatedAt: Date;
  _count: { questions: number };
  job: { progress: number; status: string } | null;
};

const draftLabels: Record<string, string> = {
  PENDING: "等待解析",
  READY: "待审核",
  FAILED: "解析失败",
  PUBLISHED: "已发布",
};

export function PaperUpload({
  courses,
  drafts,
}: {
  courses: Array<{ id: string; name: string; term: string }>;
  drafts: DraftSummary[];
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [confirmedBlank, setConfirmedBlank] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload() {
    if (busy || !courseId || !file || !confirmedBlank) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("courseId", courseId);
      form.set("file", file);
      form.set("confirmedBlank", String(confirmedBlank));
      const response = await fetch("/api/teacher/exams/drafts", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "上传失败");
      window.location.replace("/teacher/exams#exam-paper-drafts");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <form
        aria-labelledby="exam-upload-title"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void upload();
        }}
        className="space-y-4 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5"
      >
        <div>
          <h2 id="exam-upload-title" className="font-semibold text-slate-950">
            生成试卷草稿
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            上传后可在考试管理查看解析进度，核对题目后再发布。
          </p>
        </div>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          课程
          <select
            className="h-10 min-w-0 rounded-lg border bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            value={courseId}
            disabled={busy || courses.length === 0}
            onChange={(event) => setCourseId(event.target.value)}
          >
            {courses.length === 0 && <option value="">暂无可选课程</option>}
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.term}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          试卷文件
          <input
            accept=".doc,.docx,.pdf,.txt,.json"
            aria-describedby="exam-upload-formats"
            className="min-h-10 w-full min-w-0 rounded-lg border text-sm text-slate-700 file:me-3 file:min-h-10 file:border-0 file:bg-sky-50 file:px-3 file:font-medium file:text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            disabled={busy}
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <p id="exam-upload-formats" className="text-sm text-slate-600">
          支持 PDF、DOCX、DOC、TXT 和 JSON。含图题的旧 DOC 请转为 DOCX 或 PDF。
        </p>
        <label className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
          <input
            className="mt-1.5 size-4 shrink-0 accent-sky-700"
            type="checkbox"
            disabled={busy}
            checked={confirmedBlank}
            onChange={(event) => setConfirmedBlank(event.target.checked)}
          />
          我已确认试卷不含学生姓名、学号、作答或其他个人信息；试卷文字和页面图片将发送给配置的
          AI 服务解析。
        </label>
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end border-t pt-4">
          <button
            type="submit"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
            disabled={busy || !file || !courseId || !confirmedBlank}
          >
            <Upload aria-hidden="true" className="size-4" />
            {busy ? "正在上传…" : "上传并开始解析"}
          </button>
        </div>
      </form>
      <section className="space-y-3 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5">
        <h2 className="font-semibold text-slate-950">试卷草稿</h2>
        {drafts.length ? (
          <ul className="divide-y">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-3 text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                  href={`/teacher/exams/drafts/${draft.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {draft.title || draft.sourceFileName}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {draft.status === "PENDING" &&
                      draft.job?.status === "RUNNING"
                        ? "解析中"
                        : (draftLabels[draft.status] ?? "待处理")}{" "}
                      · {draft._count.questions} 题 ·{" "}
                      {new Date(draft.updatedAt).toLocaleString("zh-CN")}
                      {draft.status === "PENDING" &&
                      draft.job?.status === "RUNNING"
                        ? ` · 解析 ${draft.job.progress}%`
                        : ""}
                    </p>
                  </div>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            暂无试卷草稿。
          </p>
        )}
      </section>
    </div>
  );
}
