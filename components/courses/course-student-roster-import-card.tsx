"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { requestApi } from "@/components/courses/request-api";
import {
  buildInitialCredentialCsv,
  initialCredentialCsvFilename,
} from "@/services/student-imports/credential-export";
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

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN");
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

export function CourseStudentRosterImportCard({
  courseId,
  linkedClassrooms,
}: {
  courseId: string;
  linkedClassrooms: TeacherCourseClassroomView[];
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<CourseFileVersionClientView[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [selectedClassroomId, setSelectedClassroomId] = useState(
    linkedClassrooms[0]?.id ?? "",
  );
  const [preview, setPreview] = useState<StudentImportPreviewPage | null>(null);
  const [credentials, setCredentials] = useState<StudentInitialCredential[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  async function uploadRoster(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);
    setError(null);
    setMessage(null);
    setPreview(null);
    setCredentials([]);

    const result = await requestApi<CourseFileVersionClientView>(
      `/api/teacher/courses/${courseId}/files/student-roster`,
      { method: "POST", body: formData },
    );

    setIsUploading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }

    setFiles((current) => [result.data, ...current]);
    setSelectedFileId(result.data.id);
    setMessage("学生名单已上传。");
  }

  async function previewImport() {
    if (!selectedFileId || !selectedClassroomId) {
      setError("请选择学生名单文件和目标班级。");
      return;
    }

    setIsPreviewing(true);
    setError(null);
    setMessage(null);
    setCredentials([]);
    const result = await requestApi<StudentImportPreviewPage>(
      `/api/teacher/course-files/${selectedFileId}/student-import-preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classroomId: selectedClassroomId,
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
    setMessage("名单预览已确认。");
  }

  async function executeImport() {
    if (!preview) {
      setError("请先生成并确认名单预览。");
      return;
    }

    if (
      !window.confirm(
        `确认执行本次导入？将新建 ${preview.batch.summary.newUserRows} 个学生账号，并为已存在学生入班。`,
      )
    ) {
      return;
    }

    setIsExecuting(true);
    setError(null);
    setMessage(null);
    setCredentials([]);
    const result = await requestApi<StudentImportExecutionResult>(
      `/api/teacher/student-import-batches/${preview.batch.id}/execute`,
      { method: "POST" },
    );

    setIsExecuting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }

    setCredentials(result.data.initialCredentials);
    if (result.data.initialCredentials.length > 0) {
      setMessage("导入完成。初始账号表只在当前页面可下载一次。");
    } else {
      setMessage("导入完成。本次没有新建学生账号。");
    }
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
      setError(
        "账号表生成失败；当前页面仍保留本次明文凭据，可以重试下载。刷新或离开后将无法再次获取。",
      );
      return;
    }

    const mark = await requestApi<{
      batchId: string;
      downloadCount: number;
    }>(
      `/api/teacher/student-import-batches/${preview.batch.id}/account-sheet-downloads`,
      { method: "POST" },
    );
    setCredentials([]);
    setIsDownloading(false);

    if (!mark.success) {
      setError(
        "账号表已在浏览器生成，但下载审计记录失败；本页已清除明文，不能再次下载。",
      );
      return;
    }

    setMessage("账号表已生成下载，本页已清除明文初始密码。");
  }

  const selectedFile = files.find((file) => file.id === selectedFileId);

  return (
    <section className="bg-card rounded-xl border p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">学生名单导入</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            上传名单后预览并执行导入，新建账号的初始密码只在本次结果中出现。
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          disabled={isLoading || isUploading}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          {isUploading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              上传中
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              上传名单
            </>
          )}
        </button>
      </div>

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

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium">名单文件</span>
          <select
            className="border-input mt-2 w-full rounded-md border bg-white px-3 py-2"
            disabled={isLoading || files.length === 0}
            onChange={(event) => {
              setSelectedFileId(event.target.value);
              setPreview(null);
              setCredentials([]);
            }}
            value={selectedFileId}
          >
            {files.length === 0 ? (
              <option value="">暂无名单文件</option>
            ) : (
              files.map((file) => (
                <option key={file.id} value={file.id}>
                  v{file.versionNumber} · {file.originalFileName}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="text-sm">
          <span className="font-medium">目标班级</span>
          <select
            className="border-input mt-2 w-full rounded-md border bg-white px-3 py-2"
            disabled={linkedClassrooms.length === 0}
            onChange={(event) => {
              setSelectedClassroomId(event.target.value);
              setPreview(null);
              setCredentials([]);
            }}
            value={selectedClassroomId}
          >
            {linkedClassrooms.length === 0 ? (
              <option value="">暂无关联班级</option>
            ) : (
              linkedClassrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-lg border border-dashed p-5 text-sm text-gray-500">
          正在读取名单文件...
        </div>
      ) : selectedFile ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">
              {selectedFile.originalFileName}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              v{selectedFile.versionNumber} ·{" "}
              {formatDate(selectedFile.createdAt)}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed p-5 text-sm text-gray-500">
          当前课程暂无名单文件。
        </div>
      )}

      {preview ? (
        <div className="mt-4 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold">导入预览</h3>
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground text-xs">新建账号</dt>
              <dd className="mt-1 font-medium">
                {preview.batch.summary.newUserRows}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">匹配账号</dt>
              <dd className="mt-1 font-medium">
                {preview.batch.summary.existingUserRows}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">已在班级</dt>
              <dd className="mt-1 font-medium">
                {preview.batch.summary.alreadyEnrolledRows}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">错误行</dt>
              <dd className="mt-1 font-medium">
                {preview.batch.summary.errorRows}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {credentials.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              本次新建 {credentials.length}{" "}
              个学生账号，初始账号表只可在当前页面下载一次。
            </p>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={isDownloading}
              onClick={() => void downloadCredentials()}
              type="button"
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  生成中
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  下载账号表
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          disabled={
            isPreviewing ||
            isExecuting ||
            !selectedFileId ||
            !selectedClassroomId
          }
          onClick={() => void previewImport()}
          type="button"
        >
          {isPreviewing ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          预览名单
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          disabled={isExecuting || !preview || !preview.batch.summary.canImport}
          onClick={() => void executeImport()}
          type="button"
        >
          {isExecuting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          执行导入
        </button>
      </div>

      {message ? (
        <p className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {message}
        </p>
      ) : null}

      {error ? (
        <div className="mt-4 flex flex-col gap-3 rounded-md bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
          <button
            className="inline-flex items-center gap-2 font-medium"
            onClick={() => void loadFiles()}
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
            重试
          </button>
        </div>
      ) : null}
    </section>
  );
}
