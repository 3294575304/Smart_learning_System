"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { AdminCourseCategory } from "@/components/admin/question-course-category-manager";
import { requestApi } from "@/components/courses/request-api";
import { normalizeCourseNo } from "@/lib/course-no";
import type {
  CourseCategoryImportAction,
  CourseCategoryImportCandidate,
  CourseCategoryImportConflict,
  CourseCategoryImportPreview,
} from "@/services/question-course-categories/catalog-schemas";

type Candidate = CourseCategoryImportCandidate;
type Preview = CourseCategoryImportPreview;

interface BulkResult {
  created: AdminCourseCategory[];
  backfilled: Array<{ id: string; name: string; courseNo: string }>;
  skipped: Array<{
    name: string;
    courseNo: string | null;
    reason:
      | "EXISTS"
      | "DUPLICATE"
      | "COURSE_NO_TAKEN"
      | "NOT_FOUND"
      | "ALREADY_HAS_COURSE_NO";
  }>;
}

interface EditableRow {
  key: string;
  name: string;
  courseNo: string;
  credits: string;
  hours: string;
  term: string;
  category: string;
  nature: string;
  rowNumber: number | null;
  existingCategoryId: string | null;
  existingCourseNo: string | null;
  originalNameKey: string;
  originalCourseNo: string;
  originalCourseNoTaken: boolean;
  selected: boolean;
}

interface EvaluatedRow extends EditableRow {
  conflicts: CourseCategoryImportConflict[];
  action: CourseCategoryImportAction;
  selectable: boolean;
  invalidName: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCompleted: (result: {
    created: AdminCourseCategory[];
    backfilled: BulkResult["backfilled"];
  }) => void;
}

type Step = "upload" | "review" | "done";

const EXTRACTOR_LABEL: Record<Preview["extractor"], string> = {
  AI: "AI 识别",
  RULE: "规则识别",
};

const CONFLICT_LABELS: Record<CourseCategoryImportConflict, string> = {
  MISSING_COURSE_NO: "缺课程号",
  IN_FILE_NAME_CONFLICT: "同名不同号",
  IN_FILE_NO_CONFLICT: "同号不同名",
  EXISTING_NAME_NO_MISMATCH: "与已有分类不一致",
  COURSE_NO_TAKEN: "课程号已被占用",
};

const SKIP_LABELS: Record<BulkResult["skipped"][number]["reason"], string> = {
  EXISTS: "已存在",
  DUPLICATE: "重复",
  COURSE_NO_TAKEN: "课程号被占用",
  NOT_FOUND: "分类不存在",
  ALREADY_HAS_COURSE_NO: "已有课程号",
};

function nameKey(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("zh-CN");
}

function metaText(row: EditableRow) {
  return [
    row.credits ? `${row.credits} 学分` : "",
    row.hours ? `${row.hours} 学时` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function evaluateRows(rows: EditableRow[]): EvaluatedRow[] {
  const nameIndex = new Map<string, Set<string>>();
  const noIndex = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.courseNo) continue;
    const key = nameKey(row.name);
    const numbers = nameIndex.get(key) ?? new Set<string>();
    numbers.add(row.courseNo);
    nameIndex.set(key, numbers);
    const names = noIndex.get(row.courseNo) ?? new Set<string>();
    names.add(key);
    noIndex.set(row.courseNo, names);
  }

  return rows.map((row) => {
    const conflicts: CourseCategoryImportConflict[] = [];
    const key = nameKey(row.name);
    const invalidName = !row.name.trim();
    const existingCategory =
      row.existingCategoryId && key === row.originalNameKey
        ? { id: row.existingCategoryId, courseNo: row.existingCourseNo }
        : null;
    let action: CourseCategoryImportAction = "CREATE";

    if (!row.courseNo) {
      conflicts.push("MISSING_COURSE_NO");
    } else {
      if ((nameIndex.get(key)?.size ?? 0) > 1) {
        conflicts.push("IN_FILE_NAME_CONFLICT");
      }
      if ((noIndex.get(row.courseNo)?.size ?? 0) > 1) {
        conflicts.push("IN_FILE_NO_CONFLICT");
      }
    }

    if (row.originalCourseNoTaken && row.courseNo === row.originalCourseNo) {
      conflicts.push("COURSE_NO_TAKEN");
    }

    if (existingCategory) {
      if (existingCategory.courseNo === row.courseNo) {
        action = "SKIP";
      } else if (existingCategory.courseNo === null) {
        action = row.courseNo ? "BACKFILL" : "SKIP";
      } else {
        conflicts.push("EXISTING_NAME_NO_MISMATCH");
        action = "SKIP";
      }
    }

    if (conflicts.includes("COURSE_NO_TAKEN") && action === "CREATE") {
      action = "SKIP";
    }

    const selectable =
      !invalidName &&
      conflicts.length === 0 &&
      (action === "CREATE" || action === "BACKFILL");

    return { ...row, conflicts, action, selectable, invalidName };
  });
}

function rowFromCandidate(candidate: Candidate): EditableRow {
  return {
    key: candidate.key,
    name: candidate.name,
    courseNo: candidate.courseNo,
    credits: candidate.credits,
    hours: candidate.hours,
    term: candidate.term,
    category: candidate.category,
    nature: candidate.nature,
    rowNumber: candidate.rowNumber,
    existingCategoryId: candidate.existingCategoryId,
    existingCourseNo: candidate.existingCourseNo,
    originalNameKey: nameKey(candidate.name),
    originalCourseNo: candidate.courseNo,
    originalCourseNoTaken: candidate.conflicts.includes("COURSE_NO_TAKEN"),
    selected: candidate.action === "CREATE" && candidate.conflicts.length === 0,
  };
}

export function CourseCategoryImportDialog({
  open,
  onClose,
  onCompleted,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
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
    setRows(response.data.candidates.map(rowFromCandidate));
    setStep("review");
  }

  function updateRow(key: string, patch: Partial<EditableRow>) {
    setRows((items) =>
      items.map((item) =>
        item.key === key
          ? {
              ...item,
              ...patch,
              ...(patch.name !== undefined
                ? { existingCategoryId: null, existingCourseNo: null }
                : {}),
            }
          : item,
      ),
    );
  }

  const evaluatedRows = evaluateRows(rows);
  const selectableRows = evaluatedRows.filter((row) => row.selectable);
  const selectedRows = evaluatedRows.filter(
    (row) => row.selected && row.selectable,
  );
  const allSelected =
    selectableRows.length > 0 && selectedRows.length === selectableRows.length;
  const availableCount = evaluatedRows.filter(
    (row) => row.action === "CREATE" && row.selectable,
  ).length;
  const backfillCount = evaluatedRows.filter(
    (row) => row.action === "BACKFILL" && row.selectable,
  ).length;
  const conflictCount = evaluatedRows.filter(
    (row) => row.conflicts.length > 0 || row.invalidName,
  ).length;
  const missingCourseNoCount = evaluatedRows.filter((row) =>
    row.conflicts.includes("MISSING_COURSE_NO"),
  ).length;

  async function commit() {
    if (!preview) return;
    if (!selectedRows.length) {
      setError("请至少选择一门课程分类，或先补全课程号与名称。");
      return;
    }
    const invalid = selectedRows.find(
      (row) =>
        row.conflicts.length > 0 || row.invalidName || !row.courseNo.trim(),
    );
    if (invalid) {
      setError("已选课程中仍有冲突或缺少课程号，请先修正或取消勾选。");
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
          items: selectedRows.map((row) => ({
            name: row.name.trim(),
            courseNo: normalizeCourseNo(row.courseNo),
            ...(row.action === "BACKFILL" && row.existingCategoryId
              ? { categoryId: row.existingCategoryId }
              : {}),
          })),
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
    onCompleted({
      created: response.data.created,
      backfilled: response.data.backfilled,
    });
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
      className="bg-popover text-popover-foreground backdrop:bg-foreground/30 fixed inset-0 m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-xl border p-5 shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            一键添加课程分类
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            上传教学计划运行表，识别课程清单；课程必须有课程号，核对修改后一次性创建或补全。
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
            MB。表格需要包含「课程名称」与「课程号」列；识别后可在下一步逐行修改。
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
              识别 {evaluatedRows.length} 门 · 可新增 {availableCount} 门 ·
              可回填 {backfillCount} 门 · 冲突 {conflictCount} 门 · 缺号{" "}
              {missingCourseNoCount} 门
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
                    items.map((item) => {
                      const evaluated = evaluatedRows.find(
                        (row) => row.key === item.key,
                      );
                      return evaluated?.selectable
                        ? { ...item, selected: event.target.checked }
                        : item;
                    }),
                  )
                }
                type="checkbox"
              />
              <span>全选可新增/可回填课程</span>
            </label>
            <span className="text-muted-foreground text-xs">
              课程名称与课程号可直接修改；冲突行需先修正，回填行默认不勾选
            </span>
          </div>

          <div className="max-h-[42dvh] divide-y overflow-y-auto rounded-md border">
            {evaluatedRows.map((row) => (
              <div
                className={`flex flex-wrap items-center gap-2 px-3 py-2 ${
                  row.action === "SKIP" ? "bg-slate-50" : ""
                }`}
                key={row.key}
              >
                <input
                  aria-label={`选择 ${row.name}`}
                  checked={row.selected && row.selectable}
                  disabled={!row.selectable}
                  onChange={(event) =>
                    updateRow(row.key, { selected: event.target.checked })
                  }
                  type="checkbox"
                />
                <input
                  aria-label="课程名称"
                  className="min-w-48 flex-1 rounded-md border px-2 py-1 text-sm"
                  maxLength={100}
                  onChange={(event) =>
                    updateRow(row.key, { name: event.target.value })
                  }
                  value={row.name}
                />
                <input
                  aria-label="课程号"
                  className="w-40 rounded-md border px-2 py-1 font-mono text-sm uppercase"
                  maxLength={50}
                  placeholder="课程号"
                  onChange={(event) =>
                    updateRow(row.key, {
                      courseNo: normalizeCourseNo(event.target.value),
                    })
                  }
                  value={row.courseNo}
                />
                <div className="flex flex-wrap items-center gap-1">
                  {row.invalidName ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      名称不能为空
                    </span>
                  ) : null}
                  {row.conflicts.map((conflict) => (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        conflict === "MISSING_COURSE_NO"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-700"
                      }`}
                      key={conflict}
                    >
                      {CONFLICT_LABELS[conflict]}
                    </span>
                  ))}
                  {row.action === "BACKFILL" && !row.conflicts.length ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                      可回填课程号
                    </span>
                  ) : null}
                  {row.action === "SKIP" && !row.conflicts.length ? (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      已存在，跳过
                    </span>
                  ) : null}
                </div>
                {metaText(row) ? (
                  <span className="text-muted-foreground text-xs">
                    {metaText(row)}
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
                  ? "正在处理…"
                  : `确认新增/回填 ${selectedRows.length} 门课程`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="mt-5 space-y-3 text-sm">
          <p className="rounded-md bg-emerald-50 p-3 text-emerald-800">
            已新增 {result.created.length} 个课程分类，回填{" "}
            {result.backfilled.length} 个课程号
            {result.skipped.length
              ? `，跳过 ${result.skipped.length} 个。`
              : "。"}
          </p>
          {result.created.length ? (
            <ul className="text-muted-foreground max-h-40 list-inside list-disc overflow-y-auto text-xs leading-5">
              {result.created.map((category) => (
                <li key={category.id}>
                  {category.name}（{category.courseNo}）
                </li>
              ))}
            </ul>
          ) : null}
          {result.backfilled.length ? (
            <ul className="max-h-32 list-inside list-disc overflow-y-auto text-xs leading-5 text-sky-700">
              {result.backfilled.map((category) => (
                <li key={category.id}>
                  已回填 {category.name}：{category.courseNo}
                </li>
              ))}
            </ul>
          ) : null}
          {result.skipped.length ? (
            <ul className="text-muted-foreground max-h-32 list-inside list-disc overflow-y-auto text-xs leading-5">
              {result.skipped.map((item, index) => (
                <li key={`${item.name}-${item.courseNo ?? ""}-${index}`}>
                  {item.name}
                  {item.courseNo ? `（${item.courseNo}）` : ""}：
                  {SKIP_LABELS[item.reason]}
                </li>
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
