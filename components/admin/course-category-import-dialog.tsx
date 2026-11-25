"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { AdminCourseCategory } from "@/components/admin/question-course-category-manager";
import { requestApi } from "@/components/courses/request-api";

interface Candidate {
  key: string;
  name: string;
  courseNo: string;
  credits: string;
  hours: string;
  term: string;
  category: string;
  nature: string;
  rowNumber: number | null;
  exists: boolean;
}

interface Preview {
  fileName: string;
  format: "csv" | "xls" | "xlsx";
  sheetName: string;
  headerRowNumber: number | null;
  extractor: "AI" | "RULE";
  aiNote: string | null;
  candidates: Candidate[];
  warnings: string[];
  summary: {
    total: number;
    available: number;
    existing: number;
    ignored: number;
  };
}

interface BulkResult {
  created: AdminCourseCategory[];
  skipped: Array<{ name: string; reason: "EXISTS" | "DUPLICATE" }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (categories: AdminCourseCategory[]) => void;
}

type Step = "upload" | "review" | "done";

const EXTRACTOR_LABEL: Record<Preview["extractor"], string> = {
  AI: "AI 识别",
  RULE: "规则识别",
};

function metaText(row: Candidate) {
  return [
    row.courseNo ? `课程号 ${row.courseNo}` : "",
    row.credits ? `${row.credits} 学分` : "",
    row.hours ? `${row.hours} 学时` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CourseCategoryImportDialog({
  open,
  onClose,
  onCreated,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<Array<Candidate & { selected: boolean }>>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [uploadKey, setUploadKey] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStep("upload");
    setFile(null);
    setPreview(null);
    setRows([]);
    setError(null);
    setResult(null);
    setBusy(false);
    setUploadKey((value) => value + 1);
  }, [open]);

  async function identify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("请先选择要识别的教学计划表。");
      return;
    }
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    const response = await requestApi<Preview>(
      "/api/admin/question-course-categories/import",
      { method: "POST", body: formData },
    );
    setBusy(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setPreview(response.data);
    setRows(
      response.data.candidates.map((candidate) => ({
        ...candidate,
        selected: !candidate.exists,
      })),
    );
    setStep("review");
  }

  function updateRow(
    key: string,
    patch: Partial<Candidate & { selected: boolean }>,
  ) {
    setRows((items) =>
      items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  const selectableRows = rows.filter((row) => !row.exists);
  const selectedRows = rows.filter((row) => row.selected && !row.exists);
  const allSelected =
    selectableRows.length > 0 && selectedRows.length === selectableRows.length;

  async function commit() {
    if (!preview) return;
    const names = selectedRows
      .map((row) => row.name.trim())
      .filter((name) => name.length > 0);
    if (!names.length) {
      setError("请至少选择一门课程分类，或先补充课程名称。");
      return;
    }
    if (selectedRows.length !== names.length) {
      setError("已选课程中存在空白名称，请补充或取消选择。");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await requestApi<BulkResult>(
      "/api/admin/question-course-categories/bulk",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          names,
          sourceFileName: preview.fileName,
          extractor: preview.extractor,
        }),
      },
    );
    setBusy(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setResult(response.data);
    onCreated(response.data.created);
    setStep("done");
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="bg-popover text-popover-foreground backdrop:bg-foreground/30 fixed inset-0 m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border p-5 shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            一键添加课程分类
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            上传教学计划运行表，由 AI 识别课程清单，核对修改后一次性创建分类。
          </p>
        </div>
        <button
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={busy}
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {step === "upload" ? (
        <form className="mt-5 space-y-4" onSubmit={identify}>
          <label className="block space-y-1">
            <span className="text-sm font-medium">教学计划表</span>
            <input
              accept=".xls,.xlsx,.csv"
              className="block w-full rounded-md border px-3 py-2 text-sm"
              disabled={busy}
              key={uploadKey}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
              type="file"
            />
          </label>
          <p className="text-muted-foreground text-xs leading-5">
            支持 .xls、.xlsx、.csv，单个文件不超过 5
            MB。识别的课程名不会自动补课程号， 如需纳入正式分类请在下一步核对。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="bg-brand hover:bg-brand-strong min-h-11 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-60"
              disabled={busy || !file}
              type="submit"
            >
              {busy ? "正在识别课程清单…" : "开始识别"}
            </button>
            {busy ? (
              <span className="text-muted-foreground text-sm" role="status">
                正在读取表格并调用 AI，通常需要数秒，请勿关闭窗口。
              </span>
            ) : null}
          </div>
        </form>
      ) : null}

      {step === "review" && preview ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{preview.fileName}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              工作表 {preview.sheetName}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                preview.extractor === "AI"
                  ? "bg-sky-50 text-sky-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {EXTRACTOR_LABEL[preview.extractor]}
            </span>
            <span className="text-muted-foreground text-xs">
              识别 {preview.summary.total} 门 · 可新增{" "}
              {preview.summary.available} 门 · 已存在 {preview.summary.existing}{" "}
              门
            </span>
          </div>

          {preview.warnings.length ? (
            <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-y py-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                checked={allSelected}
                disabled={!selectableRows.length}
                onChange={(event) =>
                  setRows((items) =>
                    items.map((item) =>
                      item.exists
                        ? item
                        : { ...item, selected: event.target.checked },
                    ),
                  )
                }
                type="checkbox"
              />
              <span>全选可新增课程</span>
            </label>
            <span className="text-muted-foreground text-xs">
              课程名称可直接修改，取消勾选即可跳过
            </span>
          </div>

          <div className="max-h-[42dvh] divide-y overflow-y-auto rounded-md border">
            {rows.map((row) => (
              <div
                className={`flex flex-wrap items-center gap-3 px-3 py-2 ${
                  row.exists ? "bg-slate-50" : ""
                }`}
                key={row.key}
              >
                <input
                  aria-label={`选择 ${row.name}`}
                  checked={row.selected && !row.exists}
                  disabled={row.exists}
                  onChange={(event) =>
                    updateRow(row.key, { selected: event.target.checked })
                  }
                  type="checkbox"
                />
                <input
                  aria-label="课程名称"
                  className="min-w-52 flex-1 rounded-md border px-2 py-1 text-sm"
                  maxLength={100}
                  onChange={(event) =>
                    updateRow(row.key, { name: event.target.value })
                  }
                  value={row.name}
                />
                <span className="text-muted-foreground text-xs">
                  {metaText(row) || "表格中未提供课程号与学分"}
                </span>
                {row.exists ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                    已存在
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">已选择 {selectedRows.length} 门课程</span>
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-11 rounded-lg border px-4 text-sm"
                disabled={busy}
                onClick={() => {
                  setStep("upload");
                  setPreview(null);
                  setRows([]);
                  setError(null);
                  setUploadKey((value) => value + 1);
                }}
                type="button"
              >
                重新选择文件
              </button>
              <button
                className="bg-brand hover:bg-brand-strong min-h-11 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-60"
                disabled={busy || selectedRows.length === 0}
                onClick={() => void commit()}
                type="button"
              >
                {busy
                  ? "正在添加…"
                  : `一键添加 ${selectedRows.length} 个课程分类`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="mt-5 space-y-3 text-sm">
          <p className="rounded-md bg-emerald-50 p-3 text-emerald-800">
            已添加 {result.created.length} 个课程分类
            {result.skipped.length
              ? `，跳过 ${result.skipped.length} 个（已存在或重复）。`
              : "。"}
          </p>
          {result.created.length ? (
            <ul className="text-muted-foreground max-h-48 list-inside list-disc overflow-y-auto text-xs leading-5">
              {result.created.map((category) => (
                <li key={category.id}>{category.name}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex justify-end">
            <button
              className="bg-brand hover:bg-brand-strong min-h-11 rounded-lg px-4 text-sm font-medium text-white"
              onClick={onClose}
              type="button"
            >
              完成
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
