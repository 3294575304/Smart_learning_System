"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function PaperUpload({
  courses,
  drafts,
}: {
  courses: Array<{ id: string; name: string; term: string }>;
  drafts: DraftSummary[];
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [confirmedBlank, setConfirmedBlank] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload() {
    if (!courseId || !file) return;
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
      router.push(`/teacher/exams/drafts/${body.data.id}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">上传并生成考试草稿</h2>
        <label className="block text-sm">
          课程
          <select
            className="mt-1 block w-full rounded border p-2"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.term}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          试卷文件
          <input
            accept=".doc,.docx,.pdf,.txt,.json"
            className="mt-1 block w-full rounded border p-2"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="text-sm text-slate-600">
          支持文本型和扫描版 PDF、DOCX 图题，以及 DOC、TXT、JSON 文字题。旧 DOC
          图题请转为 DOCX 或 PDF。AI
          解析后需教师逐题核对；发布时才进入共享题库。
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-1"
            type="checkbox"
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
        <button
          className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50"
          disabled={busy || !file || !courseId || !confirmedBlank}
          onClick={() => void upload()}
        >
          {busy ? "正在上传…" : "上传并开始 AI 解析"}
        </button>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">继续审核草稿</h2>
        {drafts.length ? (
          <ul className="space-y-2">
            {drafts.map((draft) => (
              <li className="rounded-xl border bg-white p-4" key={draft.id}>
                <Link
                  className="font-medium text-sky-700"
                  href={`/teacher/exams/drafts/${draft.id}`}
                >
                  {draft.title || draft.sourceFileName}
                </Link>
                <p className="mt-1 text-sm text-slate-600">
                  {draft.status} · {draft._count.questions} 题 ·{" "}
                  {new Date(draft.updatedAt).toLocaleString("zh-CN")}
                  {draft.status === "PENDING"
                    ? ` · 解析 ${draft.job?.progress ?? 0}%`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border p-5 text-sm text-slate-600">
            暂无试卷草稿。
          </p>
        )}
      </section>
    </div>
  );
}
