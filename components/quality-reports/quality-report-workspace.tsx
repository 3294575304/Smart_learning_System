"use client";

import { useCallback, useEffect, useState } from "react";

interface GradebookOption {
  id: string;
  classroom: { id: string; name: string };
  currentPublication: { id: string; versionNumber: number } | null;
  outcomeAttainmentRuns: Array<{
    id: string;
    versionNumber: number;
    gradebookPublicationId: string;
  }>;
}
interface ReportItem {
  id: string;
  versionNumber: number;
  sourceType: "PLATFORM" | "UPLOAD";
  status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  reviewStatus: "PENDING_REVIEW" | "APPROVED";
  aiStatus: "NOT_ATTEMPTED" | "SUCCEEDED" | "FALLBACK" | string;
  narrativeSnapshotJson: unknown;
  reviewedNarrativeJson: unknown;
  reviewedAt: string | null;
  reviewComment: string | null;
  createdAt: string;
  backgroundJob: { progress: number; errorCode: string | null } | null;
}
interface Workspace {
  gradebooks: GradebookOption[];
  reports: ReportItem[];
}
interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface Narrative {
  gradeAnalysis: string;
  outcomeAnalysis: string;
  outcomeDetails: Array<{ code: string; analysis: string }>;
  studentEvaluation: string;
  courseSummary: string;
  improvementMeasures: string;
}

function narrativeValue(value: unknown): Narrative | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const outcomeDetails = Array.isArray(item.outcomeDetails)
    ? item.outcomeDetails.flatMap((detail) => {
        if (!detail || typeof detail !== "object" || Array.isArray(detail))
          return [];
        const record = detail as Record<string, unknown>;
        return typeof record.code === "string" &&
          typeof record.analysis === "string"
          ? [{ code: record.code, analysis: record.analysis }]
          : [];
      })
    : [];
  for (const key of [
    "gradeAnalysis",
    "outcomeAnalysis",
    "studentEvaluation",
    "courseSummary",
    "improvementMeasures",
  ])
    if (typeof item[key] !== "string") return null;
  return {
    gradeAnalysis: item.gradeAnalysis as string,
    outcomeAnalysis: item.outcomeAnalysis as string,
    outcomeDetails,
    studentEvaluation: item.studentEvaluation as string,
    courseSummary: item.courseSummary as string,
    improvementMeasures: item.improvementMeasures as string,
  };
}

function ReviewEditor({
  courseId,
  report,
  onApproved,
}: {
  courseId: string;
  report: ReportItem;
  onApproved: () => Promise<void>;
}) {
  const initial = narrativeValue(report.narrativeSnapshotJson);
  const [draft, setDraft] = useState<Narrative | null>(initial);
  const [reviewComment, setReviewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!draft)
    return (
      <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
        AI 初稿结构无效，不能进入审核；请重新生成报告。
      </p>
    );
  const setField = (
    field: Exclude<keyof Narrative, "outcomeDetails">,
    value: string,
  ) =>
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  async function approve() {
    if (
      !window.confirm(
        "确认已核对所有统计、分析文字和改进措施？确认后将生成不可变的正式 DOCX。",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/teacher/courses/${courseId}/quality-reports/${report.id}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...draft, reviewComment }),
        },
      );
      const payload = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !payload.success)
        throw new Error(payload.error ?? "报告审核失败");
      await onApproved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "报告审核失败");
    } finally {
      setBusy(false);
    }
  }
  const fields: Array<{
    key: Exclude<keyof Narrative, "outcomeDetails">;
    label: string;
  }> = [
    { key: "gradeAnalysis", label: "成绩分析" },
    { key: "outcomeAnalysis", label: "课程目标总体分析" },
    { key: "studentEvaluation", label: "学生评价概括" },
    { key: "courseSummary", label: "课程总结" },
    { key: "improvementMeasures", label: "持续改进措施" },
  ];
  return (
    <div className="mt-4 space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <div>
        <p className="font-medium">AI 分析初稿 · 待教师人工审核</p>
        <p className="mt-1 text-xs text-gray-600">
          统计数字和图表由程序生成；以下 AI
          文字可逐项修改。课程评价小组、学院意见、签字和日期不会由平台填写。
        </p>
      </div>
      {fields.slice(0, 2).map((field) => (
        <label className="block text-sm" key={field.key}>
          {field.label}
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border bg-white px-3 py-2"
            maxLength={3000}
            onChange={(event) => setField(field.key, event.target.value)}
            required
            value={draft[field.key]}
          />
        </label>
      ))}
      {draft.outcomeDetails.map((detail, index) => (
        <label className="block text-sm" key={detail.code}>
          课程目标 {detail.code} 分析
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border bg-white px-3 py-2"
            maxLength={3000}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? {
                      ...current,
                      outcomeDetails: current.outcomeDetails.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, analysis: event.target.value }
                            : item,
                      ),
                    }
                  : current,
              )
            }
            required
            value={detail.analysis}
          />
        </label>
      ))}
      {fields.slice(2).map((field) => (
        <label className="block text-sm" key={field.key}>
          {field.label}
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border bg-white px-3 py-2"
            maxLength={3000}
            onChange={(event) => setField(field.key, event.target.value)}
            required
            value={draft[field.key]}
          />
        </label>
      ))}
      <label className="block text-sm">
        本次审核备注（选填，仅平台留痕）
        <textarea
          className="mt-1 min-h-20 w-full rounded-md border bg-white px-3 py-2"
          maxLength={1000}
          onChange={(event) => setReviewComment(event.target.value)}
          value={reviewComment}
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <a
          className="rounded-md border bg-white px-3 py-2 text-sm"
          href={`/api/teacher/courses/${courseId}/quality-reports/${report.id}/download?artifact=draft-docx`}
        >
          下载 AI 审核稿
        </a>
        <button
          className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void approve()}
          type="button"
        >
          {busy ? "正在生成正式版…" : "确认审核并生成正式 DOCX"}
        </button>
      </div>
    </div>
  );
}

export function QualityReportWorkspace({ courseId }: { courseId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [sourceType, setSourceType] = useState<"PLATFORM" | "UPLOAD">(
    "PLATFORM",
  );
  const [gradebookId, setGradebookId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/teacher/courses/${courseId}/quality-reports`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as ApiEnvelope<Workspace>;
    if (!response.ok || !payload.success || !payload.data)
      throw new Error(payload.error ?? "报告工作区加载失败");
    setWorkspace(payload.data);
    setGradebookId(
      (current) =>
        current ||
        payload.data!.gradebooks.find((item) => item.currentPublication)?.id ||
        "",
    );
  }, [courseId]);
  useEffect(() => {
    void load().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "报告工作区加载失败"),
    );
  }, [load]);
  useEffect(() => {
    if (
      !workspace?.reports.some(
        (item) => item.status === "QUEUED" || item.status === "PROCESSING",
      )
    )
      return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [load, workspace?.reports]);
  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let response: Response;
      const values = new FormData(form);
      if (sourceType === "PLATFORM") {
        const selected = workspace?.gradebooks.find(
          (item) => item.id === gradebookId,
        );
        const outcome = selected?.outcomeAttainmentRuns.find(
          (item) =>
            item.gradebookPublicationId === selected.currentPublication?.id,
        );
        response = await fetch(
          `/api/teacher/courses/${courseId}/quality-reports`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceType,
              gradebookId,
              outcomeAttainmentRunId: outcome?.id,
              courseNature: values.get("courseNature"),
              credits: values.get("credits"),
              majorClass: values.get("majorClass"),
              college: values.get("college"),
              major: values.get("major"),
            }),
          },
        );
      } else {
        if (!file) throw new Error("请选择成绩文件");
        values.set("sourceType", sourceType);
        values.set("file", file);
        response = await fetch(
          `/api/teacher/courses/${courseId}/quality-reports`,
          { method: "POST", body: values },
        );
      }
      const payload = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !payload.success)
        throw new Error(payload.error ?? "报告生成请求失败");
      setMessage("报告生成任务已提交。上传成绩不会写入正式成绩台账。");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "报告生成请求失败");
    } finally {
      setBusy(false);
    }
  }
  if (!workspace && !error)
    return (
      <div className="rounded-xl border bg-white p-6">正在加载报告工作区…</div>
    );
  return (
    <div className="space-y-6">
      <form
        className="space-y-5 rounded-xl border bg-white p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
      >
        <div>
          <h2 className="font-semibold">生成课程教学质量分析</h2>
          <p className="mt-1 text-sm text-gray-600">
            使用平台正式数据或上传独立成绩文件；两种来源都会冻结为不可变快照，并自动纳入同班级最近一次已关闭问卷的匿名聚合结果。
            系统先生成严格套用 2024 版模板的 AI
            审核稿，教师逐项核对并确认后才生成正式 DOCX。
          </p>
        </div>
        <div className="flex gap-3">
          {(["PLATFORM", "UPLOAD"] as const).map((value) => (
            <button
              className={`rounded-md border px-4 py-2 text-sm ${sourceType === value ? "bg-gray-900 text-white" : "bg-white"}`}
              key={value}
              onClick={() => setSourceType(value)}
              type="button"
            >
              {value === "PLATFORM" ? "平台正式数据" : "上传成绩文件"}
            </button>
          ))}
        </div>
        {sourceType === "PLATFORM" ? (
          <label className="block text-sm">
            已发布成绩台账
            <select
              className="mt-1 w-full rounded-md border px-3 py-2"
              onChange={(event) => setGradebookId(event.target.value)}
              required
              value={gradebookId}
            >
              <option value="">请选择</option>
              {workspace?.gradebooks
                .filter((item) => item.currentPublication)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.classroom.name} · 成绩版本 v
                    {item.currentPublication!.versionNumber}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <label className="block text-sm">
            成绩文件（XLS/XLSX/CSV，最大 10 MB）
            <input
              accept=".xls,.xlsx,.csv"
              className="mt-1 block w-full rounded-md border px-3 py-2"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
              type="file"
            />
            <span className="mt-1 block text-xs text-amber-700">
              只进入本次报告快照，不覆盖或补录正式成绩。
            </span>
          </label>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            课程性质
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              defaultValue="专业(必)"
              name="courseNature"
            />
          </label>
          <label className="text-sm">
            学分
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              defaultValue="0"
              min="0"
              name="credits"
              step="0.5"
              type="number"
            />
          </label>
          <label className="text-sm">
            专业、年级、班级
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              name="majorClass"
            />
          </label>
          <label className="text-sm">
            学院
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              name="college"
            />
          </label>
          <label className="text-sm">
            专业
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              name="major"
            />
          </label>
        </div>
        {error ? (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
          type="submit"
        >
          {busy ? "正在提交…" : "生成 AI 审核稿与成绩计算工作簿"}
        </button>
      </form>
      <section className="rounded-xl border bg-white p-6">
        <h2 className="font-semibold">生成记录</h2>
        {!workspace?.reports.length ? (
          <p className="mt-3 text-sm text-gray-500">暂无报告。</p>
        ) : (
          <div className="mt-4 space-y-3">
            {workspace.reports.map((report) => (
              <div className="rounded-lg border p-4" key={report.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      报告 v{report.versionNumber} ·{" "}
                      {report.sourceType === "PLATFORM"
                        ? "平台数据"
                        : "上传数据"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(report.createdAt).toLocaleString("zh-CN")} ·{" "}
                      {report.status}
                      {report.backgroundJob
                        ? ` · ${report.backgroundJob.progress}%`
                        : ""}
                      {report.status === "SUCCEEDED"
                        ? report.reviewStatus === "APPROVED"
                          ? " · 已人工审核"
                          : " · 待人工审核"
                        : ""}
                    </p>
                    {report.status === "FAILED" ? (
                      <p className="mt-1 text-xs text-red-700">
                        生成失败，可重新提交触发重试。
                      </p>
                    ) : null}
                  </div>
                  {report.status === "SUCCEEDED" ? (
                    <div className="flex gap-2">
                      {report.reviewStatus === "APPROVED" ? (
                        <a
                          className="rounded-md border px-3 py-2 text-sm"
                          href={`/api/teacher/courses/${courseId}/quality-reports/${report.id}/download?artifact=docx`}
                        >
                          下载正式 DOCX
                        </a>
                      ) : null}
                      <a
                        className="rounded-md border px-3 py-2 text-sm"
                        href={`/api/teacher/courses/${courseId}/quality-reports/${report.id}/download?artifact=xlsx`}
                      >
                        下载成绩工作簿
                      </a>
                    </div>
                  ) : null}
                </div>
                {report.status === "SUCCEEDED" &&
                report.reviewStatus === "PENDING_REVIEW" ? (
                  <ReviewEditor
                    courseId={courseId}
                    onApproved={load}
                    report={report}
                  />
                ) : null}
                {report.status === "SUCCEEDED" &&
                report.reviewStatus === "APPROVED" ? (
                  <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                    已于
                    {report.reviewedAt
                      ? ` ${new Date(report.reviewedAt).toLocaleString("zh-CN")}`
                      : ""}
                    完成人工审核；正式 DOCX 已冻结，后续修改请生成新报告版本。
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
