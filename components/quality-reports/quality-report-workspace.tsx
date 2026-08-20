"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  metadataDefaults: {
    courseNature: string;
    credits: number;
    majorClass: string;
    college: string;
    major: string;
    publishedSyllabusVersion: number | null;
  };
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

interface QualityAuditIssue {
  code: string;
  severity: "ERROR" | "WARNING" | "INFO";
  category: string;
  title: string;
  message: string;
  action: string;
}

interface QualityAudit {
  status: "READY" | "NEEDS_REVIEW" | "INCOMPLETE";
  counts: { errors: number; warnings: number; info: number };
  issues: QualityAuditIssue[];
}

interface ReportMetadata {
  courseNature: string;
  credits: string;
  majorClass: string;
  college: string;
  major: string;
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

function qualityAuditValue(value: unknown): QualityAudit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const audit = (value as Record<string, unknown>).qualityAudit;
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) return null;
  const record = audit as Record<string, unknown>;
  if (
    !["READY", "NEEDS_REVIEW", "INCOMPLETE"].includes(String(record.status)) ||
    !Array.isArray(record.issues) ||
    !record.counts ||
    typeof record.counts !== "object"
  )
    return null;
  const counts = record.counts as Record<string, unknown>;
  const issues = record.issues.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const current = item as Record<string, unknown>;
    if (
      typeof current.code !== "string" ||
      !["ERROR", "WARNING", "INFO"].includes(String(current.severity)) ||
      typeof current.category !== "string" ||
      typeof current.title !== "string" ||
      typeof current.message !== "string" ||
      typeof current.action !== "string"
    )
      return [];
    return [current as unknown as QualityAuditIssue];
  });
  return {
    status: record.status as QualityAudit["status"],
    counts: {
      errors: Number(counts.errors) || 0,
      warnings: Number(counts.warnings) || 0,
      info: Number(counts.info) || 0,
    },
    issues,
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
  const qualityAudit = qualityAuditValue(report.narrativeSnapshotJson);
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
    const auditNotice = qualityAudit?.counts.errors
      ? `自动审查仍有 ${qualityAudit.counts.errors} 项严重数据缺口。确认不会补造缺失数据，正式报告仍会保留对应说明。\n\n`
      : "";
    if (
      !window.confirm(
        `${auditNotice}确认已核对所有统计、分析文字和改进措施？确认后将生成不可变的正式 DOCX。`,
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
      {qualityAudit ? (
        <div
          className={`rounded-lg border p-4 ${qualityAudit.status === "INCOMPLETE" ? "border-red-300 bg-red-50" : qualityAudit.status === "NEEDS_REVIEW" ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}
        >
          <p className="font-medium">AI 初稿自动完整性审查</p>
          <p className="mt-1 text-xs text-gray-700">
            {qualityAudit.status === "READY"
              ? "未发现阻断完整性的缺口，仍需教师核对。"
              : `发现 ${qualityAudit.counts.errors} 项严重缺口、${qualityAudit.counts.warnings} 项待完善和 ${qualityAudit.counts.info} 项提示。下列检查不包含课程评价小组、学院意见、签字和日期，这些区域按模板要求始终留空。`}
          </p>
          {qualityAudit.issues.length ? (
            <div className="mt-3 space-y-2">
              {qualityAudit.issues.map((auditIssue) => (
                <div
                  className="rounded-md border bg-white p-3 text-sm"
                  key={auditIssue.code}
                >
                  <p className="font-medium">
                    {auditIssue.severity === "ERROR"
                      ? "严重"
                      : auditIssue.severity === "WARNING"
                        ? "待完善"
                        : "提示"}
                    · {auditIssue.title}
                  </p>
                  <p className="mt-1 text-gray-700">{auditIssue.message}</p>
                  <p className="mt-1 text-xs text-blue-800">
                    建议操作：{auditIssue.action}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-md bg-slate-100 p-3 text-xs text-slate-700">
          该报告生成于自动完整性审查上线前；建议重新生成新版本以获得缺失数据提示。
        </p>
      )}
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
  const [uploadClassroomId, setUploadClassroomId] = useState("");
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
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
    const defaultGradebook = payload.data.gradebooks.find(
      (item) => item.currentPublication,
    );
    setGradebookId((current) => current || defaultGradebook?.id || "");
    setUploadClassroomId(
      (current) => current || defaultGradebook?.classroom.id || "",
    );
    setMetadata(
      (current) =>
        current ?? {
          courseNature: payload.data!.metadataDefaults.courseNature,
          credits: payload.data!.metadataDefaults.credits
            ? String(payload.data!.metadataDefaults.credits)
            : "",
          majorClass:
            payload.data!.metadataDefaults.majorClass ||
            defaultGradebook?.classroom.name ||
            "",
          college: payload.data!.metadataDefaults.college,
          major: payload.data!.metadataDefaults.major,
        },
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
  const classroomOptions = useMemo(
    () =>
      Array.from(
        new Map(
          (workspace?.gradebooks ?? []).map((item) => [
            item.classroom.id,
            item.classroom,
          ]),
        ).values(),
      ),
    [workspace?.gradebooks],
  );
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
        if (uploadClassroomId) values.set("classroomId", uploadClassroomId);
        response = await fetch(
          `/api/teacher/courses/${courseId}/quality-reports`,
          { method: "POST", body: values },
        );
      }
      const payload = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !payload.success)
        throw new Error(payload.error ?? "报告生成请求失败");
      setMessage(
        sourceType === "PLATFORM"
          ? "报告生成任务已提交；如当前成绩尚无达成度版本，系统会先自动完成确定性计算。"
          : "报告生成任务已提交；系统将按正式目标—考核方式占比在报告快照内计算达成度，上传成绩不会写入正式成绩台账。",
      );
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
            平台来源会自动生成或复用当前正式成绩的达成度版本；上传来源会将正式考核方案按考核名称与成绩列对齐，并在报告快照内确定性计算达成度。
            系统先生成严格套用 2024 版模板的 AI
            审核稿，教师逐项核对并确认后才生成正式 DOCX。
          </p>
          <p className="mt-2 rounded-md bg-blue-50 p-3 text-xs text-blue-800">
            {workspace?.metadataDefaults.publishedSyllabusVersion
              ? `已读取正式教学大纲 v${workspace.metadataDefaults.publishedSyllabusVersion}，学分、课程性质、授课学院和适用专业已自动预填；请按本班实际情况核对。`
              : "当前没有可读取的正式教学大纲，基础字段不会猜测；生成后自动审查会列出缺失项。"}
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
          <div className="grid gap-4 md:grid-cols-2">
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
                只进入本次报告快照，不覆盖或补录正式成绩；课程目标达成度使用当前正式考核方案的目标占比计算。
              </span>
            </label>
            <label className="block text-sm">
              关联班级（用于问卷与班级信息）
              <select
                className="mt-1 w-full rounded-md border px-3 py-2"
                onChange={(event) => {
                  const value = event.target.value;
                  setUploadClassroomId(value);
                  const classroom = classroomOptions.find(
                    (item) => item.id === value,
                  );
                  if (classroom)
                    setMetadata((current) =>
                      current && !current.majorClass
                        ? { ...current, majorClass: classroom.name }
                        : current,
                    );
                }}
                value={uploadClassroomId}
              >
                <option value="">不关联（不会自动纳入问卷）</option>
                {classroomOptions.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            课程性质
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              name="courseNature"
              onChange={(event) =>
                setMetadata((current) =>
                  current
                    ? { ...current, courseNature: event.target.value }
                    : current,
                )
              }
              value={metadata?.courseNature ?? ""}
            />
          </label>
          <label className="text-sm">
            学分
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              min="0"
              name="credits"
              onChange={(event) =>
                setMetadata((current) =>
                  current
                    ? { ...current, credits: event.target.value }
                    : current,
                )
              }
              step="0.5"
              type="number"
              value={metadata?.credits ?? ""}
            />
          </label>
          <label className="text-sm">
            专业、年级、班级
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              name="majorClass"
              onChange={(event) =>
                setMetadata((current) =>
                  current
                    ? { ...current, majorClass: event.target.value }
                    : current,
                )
              }
              value={metadata?.majorClass ?? ""}
            />
          </label>
          <label className="text-sm">
            学院
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              name="college"
              onChange={(event) =>
                setMetadata((current) =>
                  current
                    ? { ...current, college: event.target.value }
                    : current,
                )
              }
              value={metadata?.college ?? ""}
            />
          </label>
          <label className="text-sm">
            专业
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              name="major"
              onChange={(event) =>
                setMetadata((current) =>
                  current ? { ...current, major: event.target.value } : current,
                )
              }
              value={metadata?.major ?? ""}
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
