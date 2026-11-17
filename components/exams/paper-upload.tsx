"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Upload } from "lucide-react";
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

const cardClass = "rounded-xl border border-border bg-card p-4 sm:p-[1.25rem]";

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
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  /** 上传成功后留在本页：给出去处，而不是把人踢回列表。 */
  const [created, setCreated] = useState<{ id: string; title: string } | null>(
    null,
  );

  const missing = [
    !courseId ? "选择课程" : null,
    !file ? "选择试卷文件" : null,
    !confirmedBlank ? "勾选合规确认" : null,
  ].filter((item): item is string => Boolean(item));

  async function upload() {
    if (busy || !courseId || !file || !confirmedBlank) return;
    setBusy(true);
    setError("");
    setCreated(null);
    setProgress(0);

    const form = new FormData();
    form.set("courseId", courseId);
    form.set("file", file);
    form.set("confirmedBlank", "true");

    const result = await new Promise<{ ok: boolean; body: unknown }>(
      (resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/teacher/exams/drafts");
        // 上传进度：几十 MB 的 PDF 如果没有反馈，教师会重复点击或刷新。
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setProgress(
            Math.min(99, Math.round((event.loaded / event.total) * 100)),
          );
        };
        xhr.onload = () => {
          let body: unknown = null;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            body = null;
          }
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, body });
        };
        xhr.onerror = () => resolve({ ok: false, body: null });
        xhr.send(form);
      },
    );

    setProgress(100);
    setBusy(false);

    const payload = result.body as {
      success?: boolean;
      data?: { id?: string; title?: string };
      error?: string;
    } | null;
    if (!result.ok || !payload?.success) {
      setError(payload?.error ?? "上传失败，请检查网络后重试");
      return;
    }
    setCreated({
      id: payload.data?.id ?? "",
      title: payload.data?.title ?? file.name,
    });
    setFile(null);
    setConfirmedBlank(false);
    setProgress(0);
    // 让服务端重新取一次草稿列表，新草稿出现在右侧且状态是"解析中"。
    router.refresh();
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <form
        aria-labelledby="exam-upload-title"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void upload();
        }}
        className={`${cardClass} space-y-4`}
      >
        <div>
          <h2 id="exam-upload-title" className="font-semibold">
            生成试卷草稿
          </h2>
          <p className="text-muted-foreground mt-1 text-sm leading-5">
            三步：上传文件 → AI 解析（约 1–3 分钟）→
            审核题目后发布。解析完成后可在右侧草稿里继续。
          </p>
        </div>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          课程
          <select
            className="border-border bg-card focus-visible:outline-brand h-10 min-w-0 rounded-lg border px-3 focus-visible:outline-2 focus-visible:outline-offset-2"
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
            className="border-border file:bg-brand/10 file:text-brand-strong focus-visible:outline-brand min-h-10 w-full min-w-0 rounded-lg border text-sm file:me-3 file:min-h-10 file:border-0 file:px-3 file:font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            disabled={busy}
            type="file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError("");
              setCreated(null);
            }}
          />
        </label>
        {file && (
          <p className="text-muted-foreground text-xs">
            已选：{file.name}（{(file.size / 1024 / 1024).toFixed(1)} MB）
          </p>
        )}
        <p id="exam-upload-formats" className="text-muted-foreground text-sm">
          支持 PDF、DOCX、DOC、TXT 和 JSON，单文件建议不超过 50 MB。含图题的旧
          DOC 请转为 DOCX 或 PDF。
        </p>
        <label className="bg-muted/60 flex items-start gap-2.5 rounded-lg p-3 text-sm leading-6">
          <input
            className="accent-brand mt-1.5 size-4 shrink-0"
            type="checkbox"
            disabled={busy}
            checked={confirmedBlank}
            onChange={(event) => setConfirmedBlank(event.target.checked)}
          />
          <span>
            我已确认试卷不含学生姓名、学号、作答或其他个人信息；试卷文字和页面图片将发送给配置的
            AI 服务解析。
          </span>
        </label>
        {busy && (
          <div
            role="status"
            aria-live="polite"
            className="border-border bg-muted/40 rounded-lg border px-3 py-2"
          >
            <div className="flex items-center justify-between text-xs">
              <span>正在上传…</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="bg-border mt-1.5 h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-brand h-full rounded-full transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-muted-foreground mt-1.5 text-xs">
              上传期间请勿关闭页面。
            </p>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {created && (
          <div
            role="status"
            className="border-border bg-success-soft flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 shrink-0 text-emerald-700"
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                已上传「{created.title}」，正在后台解析
              </span>
            </span>
            {created.id && (
              <Link
                href={`/teacher/exams/drafts/${created.id}`}
                className="text-brand-strong inline-flex min-h-10 items-center gap-1 text-sm font-medium underline underline-offset-4"
              >
                去审核
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          {missing.length > 0 && (
            <p className="text-muted-foreground text-xs">
              还需：{missing.join("、")}
            </p>
          )}
          <button
            type="submit"
            className="bg-brand hover:bg-brand-strong focus-visible:outline-brand inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            disabled={busy || missing.length > 0}
          >
            <Upload aria-hidden="true" className="size-4" />
            {busy ? "正在上传…" : "上传并开始解析"}
          </button>
        </div>
      </form>
      <section className={`${cardClass} space-y-3`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">试卷草稿</h2>
          <span className="text-muted-foreground text-xs">
            {drafts.length} 份
          </span>
        </div>
        {drafts.length ? (
          <ul className="divide-border divide-y">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link
                  className="hover:bg-muted focus-visible:outline-brand flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-3 focus-visible:outline-2 focus-visible:outline-offset-2"
                  href={`/teacher/exams/drafts/${draft.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {draft.title || draft.sourceFileName}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {draft.status === "PENDING" &&
                      draft.job?.status === "RUNNING"
                        ? `解析中 ${draft.job.progress}%`
                        : (draftLabels[draft.status] ?? "待处理")}{" "}
                      · {draft._count.questions} 题 ·{" "}
                      {new Date(draft.updatedAt).toLocaleString("zh-CN")}
                    </p>
                    {draft.status === "FAILED" && (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        解析失败：点开查看原因并重试解析
                      </p>
                    )}
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="text-muted-foreground size-4 shrink-0"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bg-muted/60 text-muted-foreground rounded-lg p-4 text-sm leading-6">
            暂无试卷草稿。上传后在这里查看解析进度，解析完成即可审核发布。
          </p>
        )}
      </section>
    </div>
  );
}
