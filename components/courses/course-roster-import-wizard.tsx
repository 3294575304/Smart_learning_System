"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  RefreshCw,
  ShieldAlert,
  Upload,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { requestApi } from "@/components/courses/request-api";
import { RosterImportMappingForm } from "@/components/courses/roster-import-mapping-form";
import {
  BATCH_STATUS_LABELS,
  EXECUTION_ACTION_LABELS,
  PREVIEW_STATUS_LABELS,
  PREVIEW_STATUS_STYLES,
  ROSTER_IMPORT_STEPS,
  executionSummaryItems,
  previewBlockingReason,
} from "@/components/courses/roster-import-presenters";
import {
  buildInitialCredentialCsv,
  initialCredentialCsvFilename,
} from "@/services/student-imports/credential-export";
import type { StudentImportMappingFormData } from "@/services/student-imports/schemas";
import type { TeacherCourseClassroomView } from "@/services/courses/types";
import type { CourseFileVersionView } from "@/services/course-files/types";
import type {
  StudentImportExecutionResult,
  StudentImportPreviewPage,
  StudentInitialCredential,
} from "@/services/student-imports/types";

type CourseFileVersionClientView = Omit<CourseFileVersionView, "createdAt"> & {
  createdAt: string;
};

const ACCEPTED_ROSTER_TYPES = [
  ".csv",
  ".xls",
  ".xlsx",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

function formatDate(value: string | Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN");
}

function formatFileSize(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function WizardSteps({ currentStep }: { currentStep: number }) {
  return (
    <ol className="grid gap-3 md:grid-cols-4" aria-label="名单导入步骤">
      {ROSTER_IMPORT_STEPS.map((step) => {
        const active = step.number === currentStep;
        const complete = step.number < currentStep;
        return (
          <li
            aria-current={active ? "step" : undefined}
            className={`rounded-lg border p-3 ${
              active
                ? "border-gray-900 bg-gray-900 text-white"
                : complete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "bg-white text-gray-600"
            }`}
            key={step.number}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  active
                    ? "bg-white text-gray-900"
                    : complete
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {complete ? "✓" : step.number}
              </span>
              <span className="text-sm font-semibold">{step.label}</span>
            </div>
            <p
              className={`mt-2 text-xs ${
                active ? "text-gray-300" : "text-current opacity-75"
              }`}
            >
              {step.description}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function FileHistory({
  files,
  isLoading,
  selectedFileId,
  onSelect,
}: {
  files: CourseFileVersionClientView[];
  isLoading: boolean;
  selectedFileId: string;
  onSelect: (fileId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-gray-500">
        <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
        正在读取名单文件历史版本...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <FileSpreadsheet className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-3 text-sm font-medium">还没有名单文件</p>
        <p className="text-muted-foreground mt-1 text-xs">
          上传后每次都会生成独立版本，不会覆盖历史文件。
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">选择</th>
            <th className="px-4 py-3 font-medium">版本与文件</th>
            <th className="px-4 py-3 font-medium">大小</th>
            <th className="px-4 py-3 font-medium">上传时间</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {files.map((file, index) => (
            <tr
              className={file.id === selectedFileId ? "bg-blue-50/50" : ""}
              key={file.id}
            >
              <td className="px-4 py-3">
                <input
                  aria-label={`选择名单版本 v${file.versionNumber}`}
                  checked={file.id === selectedFileId}
                  name="roster-file"
                  onChange={() => onSelect(file.id)}
                  type="radio"
                />
              </td>
              <td className="px-4 py-3">
                <p className="font-medium">
                  v{file.versionNumber}
                  {index === 0 ? (
                    <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      最新
                    </span>
                  ) : null}
                </p>
                <p
                  className="mt-1 max-w-80 truncate text-xs text-gray-600"
                  title={file.originalFileName}
                >
                  {file.originalFileName}
                </p>
              </td>
              <td className="px-4 py-3 text-gray-600">
                {formatFileSize(file.sizeBytes)}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {formatDate(file.createdAt)}
              </td>
              <td className="px-4 py-3">
                <a
                  className="font-medium text-blue-700 hover:underline"
                  href={`/api/teacher/course-files/${file.id}/download`}
                >
                  下载原文件
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewSummary({ preview }: { preview: StudentImportPreviewPage }) {
  const summary = preview.batch.summary;
  const items = [
    ["总记录", summary.totalRows],
    ["新建账号", summary.newUserRows],
    ["已有账号", summary.existingUserRows],
    ["已在班级", summary.alreadyEnrolledRows],
    ["警告记录", summary.warningRows],
    ["错误记录", summary.errorRows],
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map(([label, value]) => (
        <div className="rounded-lg border bg-white p-3" key={label}>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
      ))}
    </div>
  );
}

function BatchIssues({ preview }: { preview: StudentImportPreviewPage }) {
  if (preview.batch.batchIssues.length === 0) return null;
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-semibold text-amber-950">批次校验信息</h3>
      <ul className="mt-3 space-y-2">
        {preview.batch.batchIssues.map((issue, index) => (
          <li className="text-sm text-amber-900" key={`${issue.code}-${index}`}>
            <span className="font-medium">
              {issue.level === "error" ? "阻断错误" : "提醒"}：
            </span>
            {issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreviewRowsTable({ preview }: { preview: StudentImportPreviewPage }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">行号</th>
            <th className="px-4 py-3 font-medium">学号</th>
            <th className="px-4 py-3 font-medium">姓名</th>
            <th className="px-4 py-3 font-medium">班级</th>
            <th className="px-4 py-3 font-medium">判定</th>
            <th className="px-4 py-3 font-medium">校验信息</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {preview.rows.map((row) => (
            <tr key={row.rowNumber}>
              <td className="px-4 py-3 text-gray-600">{row.rowNumber}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {row.studentNo || "—"}
              </td>
              <td className="px-4 py-3 font-medium">
                {row.studentName || "—"}
              </td>
              <td className="px-4 py-3">{row.className || "—"}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs ${PREVIEW_STATUS_STYLES[row.previewStatus]}`}
                >
                  {PREVIEW_STATUS_LABELS[row.previewStatus]}
                </span>
              </td>
              <td className="px-4 py-3">
                {row.issues.length === 0 ? (
                  <span className="text-emerald-700">校验通过</span>
                ) : (
                  <details className="max-w-[360px]">
                    <summary className="cursor-pointer font-medium text-gray-700">
                      {
                        row.issues.filter((issue) => issue.level === "error")
                          .length
                      }{" "}
                      个错误，
                      {
                        row.issues.filter((issue) => issue.level === "warning")
                          .length
                      }{" "}
                      个提醒
                    </summary>
                    <ul className="mt-2 space-y-2 rounded-md bg-gray-50 p-3 text-xs">
                      {row.issues.map((issue, index) => (
                        <li
                          className="break-words"
                          key={`${issue.code}-${index}`}
                        >
                          <span
                            className={
                              issue.level === "error"
                                ? "font-medium text-red-700"
                                : "font-medium text-amber-800"
                            }
                          >
                            {issue.level === "error" ? "错误" : "提醒"}
                          </span>
                          ：{issue.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultRows({
  result,
  preview,
}: {
  result: StudentImportExecutionResult;
  preview: StudentImportPreviewPage;
}) {
  const previewRows = new Map(preview.rows.map((row) => [row.rowNumber, row]));
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">行号</th>
            <th className="px-4 py-3 font-medium">学号</th>
            <th className="px-4 py-3 font-medium">姓名</th>
            <th className="px-4 py-3 font-medium">处理结果</th>
            <th className="px-4 py-3 font-medium">错误代码</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {result.rows.map((row) => {
            const source = previewRows.get(row.rowNumber);
            return (
              <tr key={row.rowNumber}>
                <td className="px-4 py-3 text-gray-600">{row.rowNumber}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {source?.studentNo || "—"}
                </td>
                <td className="px-4 py-3">{source?.studentName || "—"}</td>
                <td className="px-4 py-3 font-medium">
                  {EXECUTION_ACTION_LABELS[row.action]}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  {row.errorCode ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CourseRosterImportWizard({
  courseId,
  courseName,
  courseNo,
  term,
  linkedClassrooms,
}: {
  courseId: string;
  courseName: string;
  courseNo: string;
  term: string;
  linkedClassrooms: TeacherCourseClassroomView[];
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [files, setFiles] = useState<CourseFileVersionClientView[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [selectedClassroomId, setSelectedClassroomId] = useState(
    linkedClassrooms[0]?.id ?? "",
  );
  const [preview, setPreview] = useState<StudentImportPreviewPage | null>(null);
  const [execution, setExecution] =
    useState<StudentImportExecutionResult | null>(null);
  const [credentials, setCredentials] = useState<StudentInitialCredential[]>(
    [],
  );
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasUndownloadedCredentials = credentials.length > 0;

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await requestApi<CourseFileVersionClientView[]>(
      `/api/teacher/courses/${courseId}/files/student-roster`,
    );
    setIsLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setFiles(result.data);
    setSelectedFileId((current) => current || result.data[0]?.id || "");
  }, [courseId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!hasUndownloadedCredentials) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const interceptLinks = (event: MouseEvent) => {
      const element = event.target;
      if (!(element instanceof Element)) return;
      const link = element.closest("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) {
        return;
      }
      if (
        !window.confirm(
          "一次性账号表尚未下载。离开后无法恢复本批次明文初始密码，仍要离开吗？",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", interceptLinks, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", interceptLinks, true);
    };
  }, [hasUndownloadedCredentials]);

  const selectedClassroom =
    linkedClassrooms.find(
      (classroom) => classroom.id === selectedClassroomId,
    ) ?? null;

  function resetDownstreamState() {
    setPreview(null);
    setExecution(null);
    setCredentials([]);
    setDownloadComplete(false);
    setMessage(null);
  }

  async function uploadRoster(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);
    setError(null);
    resetDownstreamState();
    const result = await requestApi<CourseFileVersionClientView>(
      `/api/teacher/courses/${courseId}/files/student-roster`,
      { method: "POST", body: formData },
    );
    setIsUploading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setFiles((current) => [
      result.data,
      ...current.filter((item) => item.id !== result.data.id),
    ]);
    setSelectedFileId(result.data.id);
    setMessage(
      `已上传 ${result.data.originalFileName}，生成 v${result.data.versionNumber}。`,
    );
  }

  async function analyzeFile() {
    if (!selectedFileId || !selectedClassroomId) {
      setError("请选择名单文件和目标班级。");
      return;
    }
    setIsPreviewing(true);
    setError(null);
    setMessage(null);
    const result = await requestApi<StudentImportPreviewPage>(
      `/api/teacher/course-files/${selectedFileId}/student-import-preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classroomId: selectedClassroomId,
          confirmMapping: false,
          page: 1,
          pageSize: 100,
        }),
      },
    );
    setIsPreviewing(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setPreview(result.data);
    setCurrentStep(2);
  }

  async function confirmMapping(data: StudentImportMappingFormData) {
    if (!selectedFileId || !selectedClassroomId) return;
    setIsPreviewing(true);
    setError(null);
    setMessage(null);
    const result = await requestApi<StudentImportPreviewPage>(
      `/api/teacher/course-files/${selectedFileId}/student-import-preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classroomId: selectedClassroomId,
          fieldMappings: data.fieldMappings,
          confirmMapping: true,
          page: 1,
          pageSize: 100,
        }),
      },
    );
    setIsPreviewing(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setPreview(result.data);
    setCurrentStep(3);
  }

  async function changePreviewPage(page: number) {
    if (!preview) return;
    setIsPreviewing(true);
    setError(null);
    const result = await requestApi<StudentImportPreviewPage>(
      `/api/teacher/student-import-batches/${preview.batch.id}?page=${page}&pageSize=${preview.pagination.pageSize}`,
    );
    setIsPreviewing(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setPreview(result.data);
  }

  async function executeImport() {
    if (!preview || !preview.batch.summary.canImport) return;
    if (
      !window.confirm(
        `确认正式导入到“${selectedClassroom?.name ?? "目标班级"}”吗？本次将新建 ${preview.batch.summary.newUserRows} 个账号、匹配 ${preview.batch.summary.existingUserRows} 个已有账号。`,
      )
    ) {
      return;
    }
    setCurrentStep(4);
    setIsExecuting(true);
    setError(null);
    setMessage(null);
    const result = await requestApi<StudentImportExecutionResult>(
      `/api/teacher/student-import-batches/${preview.batch.id}/execute`,
      { method: "POST" },
    );
    setIsExecuting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setExecution(result.data);
    setCredentials(result.data.initialCredentials);
    setMessage(
      result.data.initialCredentials.length > 0
        ? "正式导入完成。请立即下载本批次一次性账号表。"
        : "正式导入完成，本批次没有新建学生账号。",
    );
  }

  async function downloadCredentials() {
    if (!preview || credentials.length === 0) return;
    setIsDownloading(true);
    setError(null);

    try {
      downloadTextFile(
        initialCredentialCsvFilename(preview.batch.id),
        buildInitialCredentialCsv(credentials),
      );
    } catch {
      setIsDownloading(false);
      setError("账号表生成失败，明文凭据仍保留在本页，请立即重试。");
      return;
    }

    const result = await requestApi<{
      batchId: string;
      downloadCount: number;
    }>(
      `/api/teacher/student-import-batches/${preview.batch.id}/account-sheet-downloads`,
      { method: "POST" },
    );
    setCredentials([]);
    setIsDownloading(false);
    setDownloadComplete(true);
    if (!result.success) {
      setError(
        "账号表已由浏览器下载，但下载审计记录失败；本页已清除明文，不能再次下载。",
      );
      return;
    }
    setMessage(
      "一次性账号表已下载，本页已清除明文初始密码。请教师通过已有联系方式自行发给学生。",
    );
  }

  const blockingReason = preview
    ? previewBlockingReason(preview.batch.summary)
    : null;

  return (
    <div className="space-y-6">
      <WizardSteps currentStep={currentStep} />

      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-muted-foreground text-xs">当前课程</p>
            <h2 className="mt-1 font-semibold">{courseName}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              课程号 {courseNo} · 学期 {term}
            </p>
          </div>
          {preview ? (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
              批次状态：{BATCH_STATUS_LABELS[preview.batch.status]}
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
          <button
            className="inline-flex shrink-0 items-center gap-2 font-medium"
            onClick={() => {
              setError(null);
              if (currentStep === 1) void loadFiles();
            }}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            {currentStep === 1 ? "重新加载" : "关闭提示后重试"}
          </button>
        </div>
      ) : null}

      {message ? (
        <p
          className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </p>
      ) : null}

      {currentStep === 1 ? (
        <section className="space-y-5 rounded-xl border bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">第一步：上传名单文件</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                支持固定模板的 .xls、同表头 .xlsx，并兼容
                CSV。学号始终按文本读取。
              </p>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {isUploading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isUploading ? "正在上传" : "上传新版本"}
            </button>
            <input
              accept={ACCEPTED_ROSTER_TYPES}
              className="sr-only"
              disabled={isUploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadRoster(file);
              }}
              ref={fileInputRef}
              type="file"
            />
          </div>

          {linkedClassrooms.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">当前课程还没有关联班级</p>
              <p className="mt-1">
                请先返回课程详情关联自己的班级，再开始名单导入。
              </p>
              <Link
                className="mt-3 inline-flex font-medium text-amber-950 underline"
                href={`/teacher/courses/${courseId}`}
              >
                返回课程详情
              </Link>
            </div>
          ) : (
            <label className="block text-sm">
              <span className="font-medium">目标班级</span>
              <select
                className="border-input mt-2 w-full rounded-md border bg-white px-3 py-2 sm:max-w-md"
                onChange={(event) => {
                  setSelectedClassroomId(event.target.value);
                  resetDownstreamState();
                }}
                value={selectedClassroomId}
              >
                {linkedClassrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}（现有 {classroom.studentCount} 人）
                  </option>
                ))}
              </select>
            </label>
          )}

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">名单文件历史版本</h3>
              <span className="text-muted-foreground text-xs">
                共 {files.length} 个版本
              </span>
            </div>
            <FileHistory
              files={files}
              isLoading={isLoading}
              onSelect={(fileId) => {
                setSelectedFileId(fileId);
                resetDownstreamState();
              }}
              selectedFileId={selectedFileId}
            />
          </div>

          <div className="flex justify-end">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              disabled={
                isPreviewing ||
                isUploading ||
                !selectedFileId ||
                !selectedClassroomId
              }
              onClick={() => void analyzeFile()}
              type="button"
            >
              {isPreviewing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {isPreviewing ? "正在识别字段" : "下一步：字段映射"}
            </button>
          </div>
        </section>
      ) : null}

      {currentStep === 2 && preview ? (
        <section className="space-y-5 rounded-xl border bg-white p-5">
          <div>
            <h2 className="font-semibold">第二步：字段映射</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              系统已根据表头自动映射。教师可以人工调整，带 * 的字段必须映射。
            </p>
          </div>
          <BatchIssues preview={preview} />
          <RosterImportMappingForm
            config={preview.batch.mappingConfig}
            isSubmitting={isPreviewing}
            onBack={() => setCurrentStep(1)}
            onSubmit={confirmMapping}
          />
        </section>
      ) : null}

      {currentStep === 3 && preview ? (
        <section className="space-y-5 rounded-xl border bg-white p-5">
          <div>
            <h2 className="font-semibold">第三步：数据预览与错误处理</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              正式导入前不会创建账号或修改班级。展开每行校验信息可查看完整错误。
            </p>
          </div>
          <PreviewSummary preview={preview} />
          <BatchIssues preview={preview} />
          {blockingReason ? (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">暂不能正式导入</p>
                <p className="mt-1">{blockingReason}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">预览校验通过</p>
                <p className="mt-1">
                  可以正式导入。已有账号不会重置密码，已在班级的记录会保持不变。
                </p>
              </div>
            </div>
          )}
          <PreviewRowsTable preview={preview} />
          {preview.pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                第 {preview.pagination.page} / {preview.pagination.totalPages}{" "}
                页
              </span>
              <div className="flex gap-2">
                <button
                  className="inline-flex items-center gap-1 rounded-md border px-3 py-2 disabled:opacity-50"
                  disabled={isPreviewing || preview.pagination.page <= 1}
                  onClick={() =>
                    void changePreviewPage(preview.pagination.page - 1)
                  }
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded-md border px-3 py-2 disabled:opacity-50"
                  disabled={
                    isPreviewing ||
                    preview.pagination.page >= preview.pagination.totalPages
                  }
                  onClick={() =>
                    void changePreviewPage(preview.pagination.page + 1)
                  }
                  type="button"
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              onClick={() => setCurrentStep(2)}
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
              调整字段映射
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                isExecuting ||
                !preview.batch.summary.canImport ||
                preview.batch.status !== "CONFIRMED"
              }
              onClick={() => void executeImport()}
              type="button"
            >
              <UsersRound className="h-4 w-4" />
              确认正式导入
            </button>
          </div>
        </section>
      ) : null}

      {currentStep === 4 ? (
        <section className="space-y-5 rounded-xl border bg-white p-5">
          <div>
            <h2 className="font-semibold">第四步：导入结果与账号交付</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              平台不会自动发送账号。教师需下载后通过已有联系方式自行分发。
            </p>
          </div>

          {isExecuting ? (
            <div
              className="rounded-lg border border-blue-200 bg-blue-50 p-6 text-center"
              role="status"
            >
              <RefreshCw className="mx-auto h-8 w-8 animate-spin text-blue-700" />
              <p className="mt-3 font-semibold text-blue-950">
                正在正式导入学生名单
              </p>
              <p className="mt-1 text-sm text-blue-800">
                系统正在事务内匹配账号、创建新账号并加入班级，请勿重复提交或关闭页面。
              </p>
            </div>
          ) : execution && preview ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {executionSummaryItems(execution.summary).map((item) => (
                  <div className="rounded-lg border p-3" key={item.label}>
                    <p className="text-muted-foreground text-xs">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold">{item.value}</p>
                  </div>
                ))}
              </div>

              {credentials.length > 0 ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">
                        有 {credentials.length} 个新账号等待交付
                      </p>
                      <p className="mt-1 text-sm">
                        一次性账号表仅可下载一次。离开或刷新后，明文初始密码无法恢复。
                      </p>
                    </div>
                    <button
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      disabled={isDownloading}
                      onClick={() => void downloadCredentials()}
                      type="button"
                    >
                      {isDownloading ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      {isDownloading ? "正在生成" : "下载一次性账号表"}
                    </button>
                  </div>
                </div>
              ) : downloadComplete ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <p className="font-semibold">账号表已下载且明文已清除</p>
                  <p className="mt-1">
                    请教师通过已有联系方式自行发给学生。平台不提供邮件、短信、微信或其他自动发送功能。
                  </p>
                </div>
              ) : execution.summary.createdUserRows === 0 ? (
                <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-700">
                  本批次没有新建账号，因此无需下载一次性账号表。
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-semibold">本页没有可下载的明文初始密码</p>
                  <p className="mt-1">
                    该批次此前已经成功执行，或首次响应未能返回到当前页面。出于安全限制，系统不能恢复旧密码；请对尚未交付的学生逐个发起密码重置。
                  </p>
                </div>
              )}

              <div>
                <h3 className="mb-3 text-sm font-semibold">逐行处理结果</h3>
                <ResultRows result={execution} preview={preview} />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              <p className="font-semibold">本次导入尚未完成</p>
              <p className="mt-1">
                {error ??
                  "未读取到导入结果。可以返回预览页再次提交；服务端幂等机制会避免重复创建账号。"}
              </p>
              <button
                className="mt-3 inline-flex items-center gap-2 font-medium"
                onClick={() => setCurrentStep(3)}
                type="button"
              >
                <ArrowLeft className="h-4 w-4" />
                返回预览
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
