"use client";
import { programmingConfigRevisionInputSchema } from "@/services/programming-questions/schemas";

import {
  Check,
  CheckCircle2,
  FileCheck2,
  FileText,
  Info,
  LoaderCircle,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type DragEvent } from "react";

import { requestAdminApi } from "@/components/admin/request-api";
import type {
  QuestionImportCourseOption,
  QuestionImportDraft,
  QuestionImportPreview,
} from "@/services/question-import/types";
import type { QuestionAnswer } from "@/services/questions/types";

const PAGE_SIZE = 20;
const TYPE_OPTIONS = [
  ["SINGLE_CHOICE", "单选题"],
  ["MULTIPLE_CHOICE", "多选题"],
  ["TRUE_FALSE", "判断题"],
  ["FILL_BLANK", "填空题"],
  ["SHORT_ANSWER", "简答题"],
  ["PYTHON_PROGRAMMING", "编程题（自动评分）"],
] as const;

function currentIssues(question: QuestionImportDraft): string[] {
  const issues: string[] = question.issues.filter((issue) =>
    issue.startsWith("判题配置无效"),
  );
  if (question.title.trim().length < 2)
    issues.push("题目标题至少需要 2 个字符");
  if (!question.content.trim()) issues.push("题干不能为空");
  if (!question.explanation.trim()) issues.push("答案解析不能为空");
  if (!question.answer) issues.push("请补充标准答案");
  if (["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(question.type)) {
    if (question.options.length < 2) issues.push("选择题至少需要两个选项");
    if (
      question.answer?.kind !== "CHOICE" ||
      question.answer.correctOptionLabels.length === 0
    ) {
      issues.push("请选择正确选项");
    }
    if (
      question.type === "SINGLE_CHOICE" &&
      question.answer?.kind === "CHOICE" &&
      question.answer.correctOptionLabels.length !== 1
    ) {
      issues.push("单选题只能有一个正确选项");
    }
    if (
      question.type === "MULTIPLE_CHOICE" &&
      question.answer?.kind === "CHOICE" &&
      question.answer.correctOptionLabels.length < 2
    ) {
      issues.push("多选题至少有两个正确选项");
    }
  }
  if (question.type === "TRUE_FALSE" && question.answer?.kind !== "BOOLEAN")
    issues.push("请选择判断题答案");
  if (
    question.type === "FILL_BLANK" &&
    (question.answer?.kind !== "TEXT" ||
      question.answer.acceptableAnswers.length === 0)
  )
    issues.push("请填写至少一个可接受答案");
  if (
    question.type === "SHORT_ANSWER" &&
    (question.answer?.kind !== "REFERENCE" || !question.answer.value.trim())
  )
    issues.push("请填写参考答案");
  return [...new Set(issues)];
}

function emptyAnswer(type: QuestionImportDraft["type"]): QuestionAnswer | null {
  if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE")
    return { kind: "CHOICE", correctOptionLabels: [] };
  if (type === "FILL_BLANK")
    return { kind: "TEXT", acceptableAnswers: [], caseSensitive: false };
  if (type === "PYTHON_PROGRAMMING") return { kind: "PROGRAMMING" };
  if (type === "SHORT_ANSWER") return { kind: "REFERENCE", value: "" };
  return null;
}

interface QuestionFileImportProps {
  courses: QuestionImportCourseOption[];
  mode: "ADMIN" | "TEACHER";
}

export function QuestionFileImport({ courses, mode }: QuestionFileImportProps) {
  const [preview, setPreview] = useState<QuestionImportPreview | null>(null);
  const [categoryId, setCategoryId] = useState(
    courses.length === 1 ? courses[0].id : "",
  );
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [importFinished, setImportFinished] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = mode === "ADMIN";
  const previewEndpoint = isAdmin
    ? "/api/admin/questions/import/preview"
    : "/api/teacher/questions/import/preview";
  const commitEndpoint = isAdmin
    ? "/api/admin/questions/import/commit"
    : "/api/teacher/questions/import/commit";
  const targetName = "共享题库";
  const backHref = isAdmin ? "/admin/questions" : "/teacher/questions";

  const importable = preview?.questions ?? [];
  const invalidCount = importable.filter(
    (question) => currentIssues(question).length > 0,
  ).length;
  const totalPages = Math.max(
    1,
    Math.ceil((preview?.questions.length ?? 0) / PAGE_SIZE),
  );
  const visibleQuestions =
    preview?.questions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];

  const sourceLabel = useMemo(() => {
    if (!preview) return null;
    return `${preview.source.fileName} · ${preview.source.format} · ${(preview.source.size / 1024 / 1024).toFixed(2)} MB`;
  }, [preview]);

  function updateQuestion(
    rowKey: string,
    updater: (question: QuestionImportDraft) => QuestionImportDraft,
  ) {
    setPreview((current) =>
      current
        ? {
            ...current,
            questions: current.questions.map((question) =>
              question.rowKey === rowKey ? updater(question) : question,
            ),
          }
        : current,
    );
  }

  async function previewFile(file: File | null) {
    setImportFinished(false);
    setPreview(null);
    setMessage(null);
    setPage(1);
    if (!file) return;
    setSelectedFileName(file.name);
    setBusy(true);
    const formData = new FormData();
    formData.set("file", file);
    const result = await requestAdminApi<QuestionImportPreview>(
      previewEndpoint,
      {
        method: "POST",
        body: formData,
      },
    );
    setBusy(false);
    setIsError(!result.success);
    if (!result.success) {
      setMessage(result.error);
      return;
    }
    setPreview(result.data);
    setMessage(
      `已识别 ${result.data.summary.total} 道题。请检查标记为“需补充”的题目后再确认导入。`,
    );
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (busy) return;
    void previewFile(event.dataTransfer.files[0] ?? null);
  }

  async function commit() {
    if (
      !preview ||
      invalidCount > 0 ||
      !categoryId ||
      !importable.length ||
      busy
    )
      return;
    setBusy(true);
    setMessage(null);
    const result = await requestAdminApi<{
      createdCount: number;
      skippedCount: number;
    }>(commitEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: {
          fileName: preview.source.fileName,
          checksum: preview.source.checksum,
        },
        categoryId,
        questions: importable,
      }),
    });
    setBusy(false);
    setIsError(!result.success);
    if (!result.success) {
      setMessage(result.error);
      return;
    }
    setMessage(
      `导入完成：新增 ${result.data.createdCount} 道；文件中的重复题按独立题目保留。`,
    );
    setPreview(null);
    setImportFinished(true);
    setSelectedFileName(null);
  }

  function answerEditor(question: QuestionImportDraft) {
    if (question.type === "PYTHON_PROGRAMMING")
      return (
        <div className="space-y-2">
          <p className="text-sm text-amber-700">
            {question.programmingConfig
              ? "已带入完整自动判题配置，确认导入时一并保存，可直接进入编程题编辑。"
              : "仍保留编程题类型。可在此填写完整判题配置 JSON，或先保存可编辑草稿；样例和评分要点不替代隐藏用例。"}
          </p>
          <label className="block space-y-1 text-sm">
            <span>
              自动判题配置 JSON（参考代码、公开/隐藏用例、分值及运行限制）
            </span>
            <textarea
              className="min-h-32 w-full rounded-md border p-3 font-mono text-xs"
              value={
                question.programmingConfigText ??
                (question.programmingConfig
                  ? JSON.stringify(question.programmingConfig, null, 2)
                  : "")
              }
              placeholder="可从包含 programmingConfig 的 JSON 题库文件导入完整配置"
              onChange={(event) => {
                const text = event.target.value;
                updateQuestion(question.rowKey, (current) => {
                  const issues = current.issues.filter(
                    (issue) => !issue.startsWith("判题配置无效"),
                  );
                  if (!text.trim())
                    return {
                      ...current,
                      programmingConfigText: text,
                      programmingConfig: undefined,
                      issues,
                    };
                  try {
                    const parsed =
                      programmingConfigRevisionInputSchema.safeParse(
                        JSON.parse(text),
                      );
                    if (parsed.success)
                      return {
                        ...current,
                        programmingConfigText: text,
                        programmingConfig: parsed.data,
                        issues,
                      };
                    issues.push(
                      `判题配置无效：${parsed.error.issues[0]?.message ?? "请检查配置"}`,
                    );
                  } catch {
                    issues.push("判题配置无效：请输入合法 JSON");
                  }
                  return {
                    ...current,
                    programmingConfigText: text,
                    programmingConfig: undefined,
                    issues,
                  };
                });
              }}
            />
          </label>
        </div>
      );
    if (
      question.type === "SINGLE_CHOICE" ||
      question.type === "MULTIPLE_CHOICE"
    ) {
      const selected =
        question.answer?.kind === "CHOICE"
          ? question.answer.correctOptionLabels
          : [];
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">选项与正确答案</span>
            <button
              className="text-sm text-sky-700"
              onClick={() =>
                updateQuestion(question.rowKey, (current) => ({
                  ...current,
                  options: [
                    ...current.options,
                    {
                      label: String.fromCharCode(65 + current.options.length),
                      content: "",
                      sortOrder: current.options.length + 1,
                    },
                  ],
                }))
              }
              type="button"
            >
              + 添加选项
            </button>
          </div>
          {question.options.map((option, index) => (
            <div
              className="grid grid-cols-[auto_4rem_1fr_auto] items-center gap-2"
              key={`${question.rowKey}-${index}`}
            >
              <input
                checked={selected.includes(option.label)}
                name={
                  question.type === "SINGLE_CHOICE"
                    ? `${question.rowKey}-answer`
                    : undefined
                }
                onChange={(event) =>
                  updateQuestion(question.rowKey, (current) => {
                    const existing =
                      current.answer?.kind === "CHOICE"
                        ? current.answer.correctOptionLabels
                        : [];
                    const next =
                      question.type === "SINGLE_CHOICE"
                        ? [option.label]
                        : event.target.checked
                          ? [...existing, option.label]
                          : existing.filter((label) => label !== option.label);
                    return {
                      ...current,
                      answer: {
                        kind: "CHOICE",
                        correctOptionLabels: [...new Set(next)],
                      },
                    };
                  })
                }
                type={question.type === "SINGLE_CHOICE" ? "radio" : "checkbox"}
              />
              <input
                className="rounded-md border px-2 py-1"
                maxLength={8}
                onChange={(event) =>
                  updateQuestion(question.rowKey, (current) => ({
                    ...current,
                    options: current.options.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, label: event.target.value.toUpperCase() }
                        : item,
                    ),
                  }))
                }
                value={option.label}
              />
              <input
                className="rounded-md border px-2 py-1"
                onChange={(event) =>
                  updateQuestion(question.rowKey, (current) => ({
                    ...current,
                    options: current.options.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, content: event.target.value }
                        : item,
                    ),
                  }))
                }
                value={option.content}
              />
              <button
                className="text-sm text-red-600"
                onClick={() =>
                  updateQuestion(question.rowKey, (current) => ({
                    ...current,
                    options: current.options.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  }))
                }
                type="button"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      );
    }
    if (question.type === "TRUE_FALSE") {
      return (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">标准答案</span>
          <select
            className="w-full rounded-md border px-3 py-2"
            onChange={(event) =>
              updateQuestion(question.rowKey, (current) => ({
                ...current,
                answer:
                  event.target.value === ""
                    ? null
                    : { kind: "BOOLEAN", value: event.target.value === "true" },
              }))
            }
            value={
              question.answer?.kind === "BOOLEAN"
                ? String(question.answer.value)
                : ""
            }
          >
            <option value="">请选择</option>
            <option value="true">正确</option>
            <option value="false">错误</option>
          </select>
        </label>
      );
    }
    if (question.type === "FILL_BLANK") {
      return (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">可接受答案（多个答案用分号分隔）</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            onChange={(event) =>
              updateQuestion(question.rowKey, (current) => ({
                ...current,
                answer: {
                  kind: "TEXT",
                  acceptableAnswers: event.target.value
                    .split(/[;；]/u)
                    .map((item) => item.trim())
                    .filter(Boolean),
                  caseSensitive: false,
                },
              }))
            }
            value={
              question.answer?.kind === "TEXT"
                ? question.answer.acceptableAnswers.join("；")
                : ""
            }
          />
        </label>
      );
    }
    return (
      <label className="block space-y-1 text-sm">
        <span className="font-medium">参考答案</span>
        <textarea
          className="min-h-24 w-full rounded-md border px-3 py-2"
          onChange={(event) =>
            updateQuestion(question.rowKey, (current) => ({
              ...current,
              answer: { kind: "REFERENCE", value: event.target.value },
            }))
          }
          value={
            question.answer?.kind === "REFERENCE" ? question.answer.value : ""
          }
        />
      </label>
    );
  }

  return (
    <div className="space-y-4">
      <nav
        aria-label="题库导入步骤"
        className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3"
      >
        {[
          {
            number: 1,
            title: "上传文件",
            description: "选择现有题库",
            icon: UploadCloud,
          },
          {
            number: 2,
            title: "识别与校对",
            description: "检查题目和标签",
            icon: ScanSearch,
          },
          {
            number: 3,
            title: "确认导入",
            description: `写入${targetName}`,
            icon: FileCheck2,
          },
        ].map((step) => {
          const activeStep = preview ? 2 : 1;
          const complete = step.number < activeStep;
          const active = step.number === activeStep;
          const Icon = step.icon;
          return (
            <div
              className={`relative flex items-center gap-2.5 px-4 py-3 sm:border-r sm:last:border-r-0 ${active ? "bg-sky-50/80" : "bg-white"}`}
              key={step.number}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${complete ? "bg-emerald-500 text-white" : active ? "bg-sky-600 text-white shadow-sm shadow-sky-200" : "bg-slate-100 text-slate-400"}`}
              >
                {complete ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <Icon aria-hidden="true" className="size-4" />
                )}
              </span>
              <span>
                <span
                  className={`block text-sm font-semibold ${active ? "text-sky-900" : "text-slate-700"}`}
                >
                  {step.title}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {step.description}
                </span>
              </span>
              {active ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-500" />
              ) : null}
            </div>
          );
        })}
      </nav>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-sky-100 text-sm font-bold text-sky-700">
              1
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">选择题库文件</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                上传后自动解析，不会立即写入{targetName}
              </p>
            </div>
          </div>
        </div>
        <input
          accept=".doc,.docx,.pdf,.txt,.json,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,application/json,text/plain"
          className="sr-only"
          disabled={busy}
          onChange={(event) =>
            void previewFile(event.target.files?.[0] ?? null)
          }
          ref={fileInputRef}
          type="file"
        />
        <div className="p-4 sm:p-5">
          <div
            className={`group flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-6 text-center transition sm:min-h-52 ${dragActive ? "border-sky-500 bg-sky-50 shadow-inner" : "border-sky-200 bg-gradient-to-b from-sky-50/80 to-white hover:border-sky-400 hover:bg-sky-50"} ${busy ? "cursor-wait opacity-75" : ""}`}
            onClick={() => !busy && fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!busy) setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setDragActive(false);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !busy)
                fileInputRef.current?.click();
            }}
          >
            <span className="relative flex size-14 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-md ring-1 shadow-sky-100 ring-sky-100 transition group-hover:-translate-y-0.5">
              {busy ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-6 animate-spin"
                />
              ) : (
                <UploadCloud aria-hidden="true" className="size-6" />
              )}
              {!busy ? (
                <span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
                  <Sparkles aria-hidden="true" className="size-3" />
                </span>
              ) : null}
            </span>
            <h3 className="mt-3.5 text-base font-semibold text-slate-900">
              {busy
                ? "正在解析题库文件…"
                : dragActive
                  ? "松开即可开始识别"
                  : "拖拽文件到这里，或点击选择"}
            </h3>
            <p className="mt-1.5 max-w-lg text-sm leading-5 text-slate-500">
              {selectedFileName
                ? `当前文件：${selectedFileName}`
                : "支持 Word、PDF、文本与 JSON 题库，系统会自动拆分题目并提取答案、解析和知识点标签。"}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {["DOC", "DOCX", "PDF", "TXT", "JSON"].map((format) => (
                <span
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm"
                  key={format}
                >
                  {format}
                </span>
              ))}
            </div>
            <button
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-200 transition hover:bg-sky-700 disabled:opacity-60"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                fileInputRef.current?.click();
              }}
              type="button"
            >
              <FileText aria-hidden="true" className="size-4" />
              {busy ? "正在识别" : "选择题库文件"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "先预览后入库",
                text: `确认前不会修改${targetName}`,
              },
              {
                icon: ScanSearch,
                title: "自动结构识别",
                text: "识别题型、选项、答案与难度",
              },
              {
                icon: Sparkles,
                title: "自动知识标签",
                text: "标签可在导入前逐题修改",
              },
            ].map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  className="flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5"
                  key={feature.title}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white text-sky-600 shadow-sm">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-slate-800">
                      {feature.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      {feature.text}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-400">
            单个文件最大 20 MB · 单次最多识别 500 道题 · PDF 需包含可复制文本
          </p>
        </div>
        {importFinished ? (
          <Link
            className="mx-5 mb-4 inline-flex rounded-md bg-sky-600 px-4 py-2 text-sm text-white"
            href={backHref}
          >
            查看已导入题目（含待配置草稿） →
          </Link>
        ) : null}
        {message ? (
          <p
            className={`mx-4 mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm sm:mx-5 sm:mb-5 ${isError ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
            role={isError ? "alert" : "status"}
          >
            {isError ? (
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
            )}
            {message}
          </p>
        ) : null}
      </section>

      {preview ? (
        <>
          <section className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">2. 选择题目课程分类</h2>
            <p className="mt-2 text-sm text-slate-600">
              文件：{sourceLabel}
              。本批题目将归入管理员维护的全局课程分类，自动知识标签会保留在每道题上。
            </p>
            {courses.length ? (
              <label className="mt-3 block space-y-2 text-sm">
                <span className="font-medium">课程分类</span>
                <select
                  className="w-full rounded-md border bg-white px-3 py-2"
                  value={categoryId}
                  disabled={busy}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">请选择课程分类</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
                <span className="block text-slate-500">
                  课程目录由管理员维护；课程知识点可在导入后单独审核绑定。
                </span>
              </label>
            ) : (
              <p className="mt-3 text-sm text-amber-700" role="status">
                暂无可用课程分类，请联系管理员维护目录。
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">3. 审核识别结果</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    共 {preview.questions.length} 道 · 可导入{" "}
                    {importable.length - invalidCount} 道 · 需补充{" "}
                    {invalidCount} 道 · 重复 {preview.summary.duplicates} 道
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                  自动标签可编辑
                </span>
              </div>
              {preview.warnings.length ? (
                <ul className="mt-3 list-inside list-disc text-sm text-amber-700">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            {visibleQuestions.map((question) => {
              const issues = currentIssues(question);
              return (
                <details
                  className={`rounded-xl border bg-white p-4 ${issues.length ? "border-amber-300" : "border-emerald-200"}`}
                  key={question.rowKey}
                  open={issues.length > 0}
                >
                  <summary className="cursor-pointer font-medium">
                    {question.title}{" "}
                    {question.duplicate ? (
                      <span className="text-sm text-slate-500">
                        （内容重复，将作为独立题目保留）
                      </span>
                    ) : issues.length ? (
                      <span className="text-sm text-amber-700">（需补充）</span>
                    ) : (
                      <span className="text-sm text-emerald-700">
                        （可导入）
                      </span>
                    )}
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_10rem_8rem]">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">标题</span>
                        <input
                          className="w-full rounded-md border px-3 py-2"
                          maxLength={120}
                          onChange={(event) =>
                            updateQuestion(question.rowKey, (current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                          value={question.title}
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">题型</span>
                        <select
                          className="w-full rounded-md border px-3 py-2"
                          onChange={(event) =>
                            updateQuestion(question.rowKey, (current) => ({
                              ...current,
                              type: event.target
                                .value as QuestionImportDraft["type"],
                              options: [
                                "SINGLE_CHOICE",
                                "MULTIPLE_CHOICE",
                              ].includes(event.target.value)
                                ? current.options
                                : [],
                              answer: emptyAnswer(
                                event.target
                                  .value as QuestionImportDraft["type"],
                              ),
                            }))
                          }
                          value={question.type}
                        >
                          {TYPE_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">难度</span>
                        <select
                          className="w-full rounded-md border px-3 py-2"
                          onChange={(event) =>
                            updateQuestion(question.rowKey, (current) => ({
                              ...current,
                              difficulty: Number(event.target.value),
                            }))
                          }
                          value={question.difficulty}
                        >
                          {[1, 2, 3, 4, 5].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium">题干</span>
                      <textarea
                        className="min-h-28 w-full rounded-md border px-3 py-2"
                        maxLength={5000}
                        onChange={(event) =>
                          updateQuestion(question.rowKey, (current) => ({
                            ...current,
                            content: event.target.value,
                          }))
                        }
                        value={question.content}
                      />
                    </label>
                    {answerEditor(question)}
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium">答案解析</span>
                      <textarea
                        className="min-h-20 w-full rounded-md border px-3 py-2"
                        maxLength={5000}
                        onChange={(event) =>
                          updateQuestion(question.rowKey, (current) => ({
                            ...current,
                            explanation: event.target.value,
                          }))
                        }
                        value={question.explanation}
                      />
                    </label>
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium">
                        知识点与来源标签（逗号分隔，最多 10 个）
                      </span>
                      <input
                        className="w-full rounded-md border px-3 py-2"
                        onChange={(event) =>
                          updateQuestion(question.rowKey, (current) => ({
                            ...current,
                            tags: event.target.value
                              .split(/[,，]/u)
                              .map((item) => item.trim())
                              .filter(Boolean)
                              .slice(0, 10),
                          }))
                        }
                        value={question.tags.join("，")}
                      />
                    </label>
                    {issues.length ? (
                      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                        {issues.join("；")}
                      </p>
                    ) : null}
                  </div>
                </details>
              );
            })}

            {totalPages > 1 ? (
              <div className="flex items-center justify-center gap-3 text-sm">
                <button
                  className="rounded-md border px-3 py-2 disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  type="button"
                >
                  上一页
                </button>
                <span>
                  第 {page} / {totalPages} 页
                </span>
                <button
                  className="rounded-md border px-3 py-2 disabled:opacity-40"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  type="button"
                >
                  下一页
                </button>
              </div>
            ) : null}

            <div className="sticky bottom-4 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  {invalidCount
                    ? `还有 ${invalidCount} 道题需要补充。`
                    : `将向${targetName}新增 ${importable.length} 道题目。${importable.some((item) => item.type === "PYTHON_PROGRAMMING" && !item.programmingConfig) ? "自动判题题目需补齐判题配置。" : "导入后可直接编辑并选入作业。"}`}
                </p>
                <div className="flex gap-3">
                  <Link
                    className="rounded-md border px-4 py-2 text-sm"
                    href={backHref}
                  >
                    取消
                  </Link>
                  <button
                    className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={
                      busy ||
                      invalidCount > 0 ||
                      !categoryId ||
                      !importable.length
                    }
                    onClick={() => void commit()}
                    type="button"
                  >
                    {busy ? "正在导入…" : `确认导入 ${importable.length} 道`}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <aside className="flex items-start gap-3 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-sky-50 p-4 text-sm leading-6 text-slate-700 shadow-sm">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-violet-600 shadow-sm">
          <Sparkles aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">
            自动标签与正式知识点的关系
          </h2>
          <p className="mt-1">
            {isAdmin
              ? "自动标签来自文件原有“知识点”字段和题干关键词，可由管理员逐题修改。教师仍需使用课程知识图谱的“一键关联绑定题目”审核主知识点和次要知识点，自动标签不会越过教师确认直接进入正式学情证据。"
              : "自动标签来自文件原有“知识点”字段和题干关键词，可由教师逐题修改。导入题目会保存到教师共同维护的共享题库，之后可在课程知识图谱中审核主知识点和次要知识点。"}
          </p>
        </div>
      </aside>
    </div>
  );
}

export function AdminQuestionFileImport({
  courses,
}: Omit<QuestionFileImportProps, "mode">) {
  return <QuestionFileImport courses={courses} mode="ADMIN" />;
}

export function TeacherQuestionFileImport({
  courses,
}: Omit<QuestionFileImportProps, "mode">) {
  return <QuestionFileImport courses={courses} mode="TEACHER" />;
}
