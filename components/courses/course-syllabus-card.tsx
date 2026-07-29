"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { requestApi } from "@/components/courses/request-api";
import type { CourseSyllabusView } from "@/services/courses/types";

type CourseSyllabusClientView = Omit<CourseSyllabusView, "uploadedAt"> & {
  uploadedAt: string;
};

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(2)} MB`;
  }
  return `${Math.max(sizeBytes / 1024, 0.01).toFixed(2)} KB`;
}

function clientFileError(file: File): string | null {
  if (file.size <= 0) return "教学大纲文件不能为空。";
  if (file.size > MAX_FILE_SIZE_BYTES) return "教学大纲文件不能超过 20 MB。";
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return "教学大纲仅支持 PDF 文件。";
  }
  if (file.type !== "application/pdf") {
    return "教学大纲文件 MIME 类型必须为 application/pdf。";
  }
  return null;
}

export function CourseSyllabusCard({ courseId }: { courseId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [syllabus, setSyllabus] = useState<CourseSyllabusClientView | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadSyllabus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await requestApi<CourseSyllabusClientView | null>(
      `/api/teacher/courses/${courseId}/syllabus`,
    );
    setIsLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setSyllabus(result.data);
  }, [courseId]);

  useEffect(() => {
    void loadSyllabus();
  }, [loadSyllabus]);

  async function uploadFile(file: File) {
    const clientError = clientFileError(file);
    if (clientError) {
      setError(clientError);
      return;
    }

    if (syllabus && !window.confirm("重新上传会替换当前教学大纲，是否继续？")) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    const result = await requestApi<CourseSyllabusClientView>(
      `/api/teacher/courses/${courseId}/syllabus`,
      {
        method: "POST",
        body: formData,
      },
    );

    setIsUploading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }

    setSyllabus(result.data);
    setSuccessMessage(syllabus ? "教学大纲已替换。" : "教学大纲已上传。");
    router.refresh();
  }

  return (
    <section className="bg-card rounded-xl border p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">教学大纲</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            课程已创建，请先上传教学大纲。当前仅支持 PDF，文件大小不超过 20 MB。
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
              {syllabus ? "重新上传" : "上传教学大纲"}
            </>
          )}
        </button>
      </div>

      <input
        accept=".pdf,application/pdf"
        className="sr-only"
        disabled={isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void uploadFile(file);
        }}
        ref={fileInputRef}
        type="file"
      />

      {isLoading ? (
        <div className="mt-4 rounded-lg border border-dashed p-5 text-sm text-gray-500">
          正在读取教学大纲信息...
        </div>
      ) : syllabus ? (
        <div className="mt-4 rounded-lg border p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate font-medium">
                  {syllabus.originalName}
                </h3>
                <dl className="text-muted-foreground mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs">文件大小</dt>
                    <dd className="font-medium text-gray-900">
                      {formatFileSize(syllabus.sizeBytes)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs">上传时间</dt>
                    <dd className="font-medium text-gray-900">
                      {new Date(syllabus.uploadedAt).toLocaleString("zh-CN")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs">上传教师</dt>
                    <dd className="font-medium text-gray-900">
                      {syllabus.uploadedBy.displayName ??
                        syllabus.uploadedBy.email ??
                        syllabus.uploadedBy.id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs">文件类型</dt>
                    <dd className="font-medium text-gray-900">
                      {syllabus.mimeType}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <a
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
              href={`/api/teacher/courses/${courseId}/syllabus/download`}
            >
              <Download className="h-4 w-4" />
              下载
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium">教学大纲未上传</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  请选择文本型 PDF 文件。上传成功后可在这里查看文件信息并下载。
                </p>
              </div>
            </div>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Upload className="h-4 w-4" />
              选择 PDF
            </button>
          </div>
        </div>
      )}

      {successMessage ? (
        <p className="mt-4 flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
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
            onClick={() => void loadSyllabus()}
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
