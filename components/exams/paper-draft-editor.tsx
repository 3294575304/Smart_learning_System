"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { QuestionType } from "@prisma/client";

import type { getPaperDraft } from "@/services/exams/paper-drafts";
import {
  paperDraftQuestionSchema,
  type PaperDraftQuestion,
} from "@/services/exams/paper-schemas";

type Draft = Awaited<ReturnType<typeof getPaperDraft>>;
type Row = Draft["questions"][number];
type Asset = Draft["assets"][number];

const TYPE_NAMES: Record<QuestionType, string> = {
  SINGLE_CHOICE: "单选题",
  MULTIPLE_CHOICE: "多选题",
  TRUE_FALSE: "判断题",
  FILL_BLANK: "填空题",
  SHORT_ANSWER: "简答题",
  PYTHON_PROGRAMMING: "编程题",
};

const PARSE_ERRORS: Record<string, string> = {
  SOURCE_PARSE_FAILED: "文件内容无法解析，请检查格式后重新上传。",
  SOURCE_CHECKSUM_MISMATCH: "文件校验失败，请重新上传。",
  AI_PAPER_UNSUPPORTED: "当前 AI 服务不支持试卷识别，请配置视觉模型后重试。",
  AI_PAPER_PARSE_FAILED: "AI 未能完成识别，可以重试或更换试卷文件。",
};

function localDatetime(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

async function api<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success)
    throw new Error(payload.error ?? "操作失败");
  return payload.data as T;
}

function emptyAnswer(type: QuestionType): PaperDraftQuestion["answer"] {
  if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE")
    return { kind: "CHOICE", correctOptionLabels: [] };
  if (type === "TRUE_FALSE") return null;
  if (type === "FILL_BLANK")
    return { kind: "TEXT", acceptableAnswers: [], caseSensitive: false };
  if (type === "SHORT_ANSWER") return { kind: "REFERENCE", value: "" };
  return { kind: "PROGRAMMING" };
}

function QuestionEditor({
  draftId,
  row,
  sourceAssets,
  sourceFormat,
  onChanged,
}: {
  draftId: string;
  row: Row;
  sourceAssets: Asset[];
  sourceFormat: string;
  onChanged: () => Promise<void>;
}) {
  const parsed = paperDraftQuestionSchema.safeParse(row.questionJson);
  const [question, setQuestion] = useState<PaperDraftQuestion>(
    parsed.success
      ? parsed.data
      : {
          title: "",
          content: "",
          type: QuestionType.SHORT_ANSWER,
          difficulty: 2,
          options: [],
          answer: null,
          explanation: "",
          tags: ["试卷导入"],
          programmingConfig: null,
        },
  );
  const [points, setPoints] = useState(row.points);
  const [configText, setConfigText] = useState(
    question.programmingConfig
      ? JSON.stringify(question.programmingConfig, null, 2)
      : "",
  );
  const [assetId, setAssetId] = useState(sourceAssets[0]?.id ?? "");
  const [rectangle, setRectangle] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const base = `/api/teacher/exams/drafts/${draftId}/questions/${row.id}`;
  const selectedAsset = sourceAssets.find((asset) => asset.id === assetId);
  function update(patch: Partial<PaperDraftQuestion>) {
    setQuestion((current) => ({ ...current, ...patch }));
    setMessage("");
  }
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const config = configText.trim() ? JSON.parse(configText) : null;
      const next = paperDraftQuestionSchema.parse({
        ...question,
        programmingConfig: config,
      });
      await api(base, "PATCH", {
        expectedRevision: row.revision,
        question: next,
        points,
      });
      setMessage("题目已保存，请重新确认审核。");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`${base}/review`, "POST", { expectedRevision: row.revision });
      setMessage("已确认本题。");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "审核失败");
    } finally {
      setBusy(false);
    }
  }
  function point(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setRectangle(null);
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const end = point(event);
    const start = dragStart.current;
    dragStart.current = null;
    const rect = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(start.x - end.x),
      height: Math.abs(start.y - end.y),
    };
    if (rect.width > 0.02 && rect.height > 0.02) setRectangle(rect);
  }
  async function crop(full = false) {
    const rect = full ? { x: 0, y: 0, width: 1, height: 1 } : rectangle;
    if (!assetId || !rect) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`${base}/crop`, "POST", {
        expectedRevision: row.revision,
        sourceAssetId: assetId,
        ...rect,
      });
      setMessage("题目图片已裁切，请检查下方预览并重新确认本题。");
      setRectangle(null);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "裁切失败");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm(`从草稿中移除第 ${row.ordinal} 题？`)) return;
    setBusy(true);
    setError("");
    try {
      await api(base, "DELETE", { expectedRevision: row.revision });
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "移除失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="rounded-xl border bg-white p-4"
      open={row.reviewedRevision !== row.revision}
    >
      <summary className="cursor-pointer font-medium">
        {row.ordinal}. {question.title || "待审核题目"} · {row.points} 分 ·{" "}
        {row.reviewedRevision === row.revision ? "已审核" : "待审核"}
        {row.answerSource === "AI_INFERRED" ? " · AI 候选答案" : ""}
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs text-slate-500">
          来源：{row.sourceLocator}。识别置信度：
          {row.confidence === null
            ? "未提供"
            : `${Math.round(row.confidence * 100)}%`}
          。AI 识别内容仅供审核，修改后请先保存再确认。
        </p>
        {Array.isArray(row.issues) && row.issues.length > 0 && (
          <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
            {row.issues.join("；")}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            题型
            <select
              className="mt-1 w-full rounded border p-2"
              value={question.type}
              onChange={(event) => {
                const type = event.target.value as QuestionType;
                update({
                  type,
                  answer: emptyAnswer(type),
                  options:
                    type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE"
                      ? question.options
                      : [],
                });
              }}
            >
              {Object.entries(TYPE_NAMES).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            分值
            <input
              className="mt-1 w-full rounded border p-2"
              min="0.01"
              step="0.01"
              type="number"
              value={points}
              onChange={(event) => setPoints(Number(event.target.value))}
            />
            {row.pointsInferred && (
              <span className="text-amber-700">
                AI 未识别，请确认分值并保存
              </span>
            )}
          </label>
          <label className="text-sm">
            难度
            <select
              className="mt-1 w-full rounded border p-2"
              value={question.difficulty}
              onChange={(event) =>
                update({ difficulty: Number(event.target.value) })
              }
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          标题
          <input
            className="mt-1 w-full rounded border p-2"
            value={question.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </label>
        <label className="block text-sm">
          题干
          <textarea
            className="mt-1 min-h-24 w-full rounded border p-2"
            value={question.content}
            onChange={(event) => update({ content: event.target.value })}
          />
        </label>
        {(question.type === "SINGLE_CHOICE" ||
          question.type === "MULTIPLE_CHOICE") && (
          <div className="space-y-2">
            <p className="text-sm font-medium">选项与正确答案</p>
            {question.options.map((option, index) => (
              <div
                className="flex items-center gap-2"
                key={`${option.label}-${index}`}
              >
                <input
                  aria-label={`${option.label} 正确`}
                  checked={
                    question.answer?.kind === "CHOICE" &&
                    question.answer.correctOptionLabels.includes(option.label)
                  }
                  type={
                    question.type === "SINGLE_CHOICE" ? "radio" : "checkbox"
                  }
                  name={`answer-${row.id}`}
                  onChange={(event) => {
                    const current =
                      question.answer?.kind === "CHOICE"
                        ? question.answer.correctOptionLabels
                        : [];
                    update({
                      answer: {
                        kind: "CHOICE",
                        correctOptionLabels:
                          question.type === "SINGLE_CHOICE"
                            ? [option.label]
                            : event.target.checked
                              ? [...current, option.label]
                              : current.filter(
                                  (label) => label !== option.label,
                                ),
                      },
                    });
                  }}
                />
                <span className="w-5 text-sm">{option.label}</span>
                <input
                  className="flex-1 rounded border p-2 text-sm"
                  value={option.content}
                  onChange={(event) =>
                    update({
                      options: question.options.map((item, i) =>
                        i === index
                          ? { ...item, content: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <button
              className="text-sm text-sky-700"
              onClick={() => {
                const label = String.fromCharCode(65 + question.options.length);
                update({
                  options: [
                    ...question.options,
                    {
                      label,
                      content: "",
                      sortOrder: question.options.length + 1,
                    },
                  ],
                });
              }}
            >
              添加选项
            </button>
          </div>
        )}
        {question.type === "TRUE_FALSE" && (
          <label className="block text-sm">
            标准答案
            <select
              className="mt-1 w-full rounded border p-2"
              value={
                question.answer?.kind === "BOOLEAN"
                  ? String(question.answer.value)
                  : ""
              }
              onChange={(event) =>
                update({
                  answer:
                    event.target.value === ""
                      ? null
                      : {
                          kind: "BOOLEAN",
                          value: event.target.value === "true",
                        },
                })
              }
            >
              <option value="">待确认</option>
              <option value="true">正确</option>
              <option value="false">错误</option>
            </select>
          </label>
        )}
        {question.type === "FILL_BLANK" && (
          <label className="block text-sm">
            可接受答案（以逗号分隔）
            <input
              className="mt-1 w-full rounded border p-2"
              value={
                question.answer?.kind === "TEXT"
                  ? question.answer.acceptableAnswers.join("，")
                  : ""
              }
              onChange={(event) =>
                update({
                  answer: {
                    kind: "TEXT",
                    acceptableAnswers: event.target.value
                      .split(/[,，]/u)
                      .map((item) => item.trim())
                      .filter(Boolean),
                    caseSensitive: false,
                  },
                })
              }
            />
          </label>
        )}
        {question.type === "SHORT_ANSWER" && (
          <label className="block text-sm">
            参考答案
            <textarea
              className="mt-1 min-h-20 w-full rounded border p-2"
              value={
                question.answer?.kind === "REFERENCE"
                  ? question.answer.value
                  : ""
              }
              onChange={(event) =>
                update({
                  answer: { kind: "REFERENCE", value: event.target.value },
                })
              }
            />
          </label>
        )}
        {question.type === "PYTHON_PROGRAMMING" && (
          <label className="block text-sm">
            完整判题配置 JSON（含公开与隐藏用例）
            <textarea
              className="mt-1 min-h-32 w-full rounded border p-2 font-mono text-xs"
              value={configText}
              onChange={(event) => setConfigText(event.target.value)}
            />
          </label>
        )}
        <label className="block text-sm">
          答案解析
          <textarea
            className="mt-1 min-h-20 w-full rounded border p-2"
            value={question.explanation}
            onChange={(event) => update({ explanation: event.target.value })}
          />
        </label>
        <label className="block text-sm">
          知识点标签（逗号分隔）
          <input
            className="mt-1 w-full rounded border p-2"
            value={question.tags.join("，")}
            onChange={(event) =>
              update({
                tags: event.target.value
                  .split(/[,，]/u)
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 10),
              })
            }
          />
        </label>
        {sourceAssets.length > 0 && (
          <details className="rounded border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              题目图片与裁切
            </summary>
            <div className="mt-3 space-y-3">
              <select
                aria-label="选择源图片"
                className="rounded border p-2 text-sm"
                value={assetId}
                onChange={(event) => {
                  setAssetId(event.target.value);
                  setRectangle(null);
                }}
              >
                {sourceAssets.map((asset, index) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.pageNumber
                      ? `第 ${asset.pageNumber} 页`
                      : `嵌入图片 ${index + 1}`}
                  </option>
                ))}
              </select>
              {selectedAsset && (
                <div
                  className="relative w-fit max-w-full touch-none select-none"
                  onPointerDown={pointerDown}
                  onPointerUp={pointerUp}
                >
                  <Image
                    alt={
                      selectedAsset.pageNumber
                        ? `试卷第 ${selectedAsset.pageNumber} 页`
                        : "原始题目图片"
                    }
                    className="max-h-[34rem] max-w-full border object-contain"
                    draggable={false}
                    src={`/api/teacher/exams/drafts/${draftId}/assets/${selectedAsset.id}`}
                    width={selectedAsset.width}
                    height={selectedAsset.height}
                    unoptimized
                  />
                  {rectangle && (
                    <div
                      className="pointer-events-none absolute border-2 border-sky-600 bg-sky-300/20"
                      style={{
                        left: `${rectangle.x * 100}%`,
                        top: `${rectangle.y * 100}%`,
                        width: `${rectangle.width * 100}%`,
                        height: `${rectangle.height * 100}%`,
                      }}
                    />
                  )}
                </div>
              )}
              <div className="flex gap-3 text-sm">
                <button
                  className="rounded border px-3 py-2 disabled:opacity-40"
                  disabled={busy || !rectangle}
                  onClick={() => void crop()}
                >
                  使用框选区域
                </button>
                {sourceFormat === "DOCX" &&
                  selectedAsset?.pageNumber === null && (
                    <button
                      className="rounded border px-3 py-2"
                      disabled={busy}
                      onClick={() => void crop(true)}
                    >
                      使用整张嵌入图片
                    </button>
                  )}
              </div>
              {row.assets.map((image) => (
                <Image
                  alt="待确认的题目附图"
                  className="max-h-72 max-w-full rounded border"
                  key={image.id}
                  src={`/api/teacher/exams/drafts/${draftId}/assets/${image.id}`}
                  width={image.width}
                  height={image.height}
                  unoptimized
                />
              ))}
            </div>
          </details>
        )}
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="text-sm text-emerald-700" role="status">
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "处理中…" : "保存题目"}
          </button>
          <button
            className="rounded bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={busy || row.reviewedRevision === row.revision}
            onClick={() => void review()}
          >
            确认本题
          </button>
          <button
            className="rounded border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
            disabled={busy}
            onClick={() => void remove()}
          >
            移除此题
          </button>
        </div>
      </div>
    </details>
  );
}

export function PaperDraftEditor({
  initial,
  classrooms,
}: {
  initial: Draft;
  classrooms: Array<{ id: string; name: string; courseId: string | null }>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [type, setType] = useState(initial.type);
  const [startsAt, setStartsAt] = useState(localDatetime(initial.startsAt));
  const [endsAt, setEndsAt] = useState(localDatetime(initial.endsAt));
  const [allowedSwitches, setAllowedSwitches] = useState(
    initial.allowedSwitches,
  );
  const [classroomIds, setClassroomIds] = useState(initial.classroomIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const base = `/api/teacher/exams/drafts/${draft.id}`;
  const refresh = useCallback(async () => {
    const next = await api<Draft>(base, "GET");
    setDraft(next);
  }, [base]);
  useEffect(() => {
    if (draft.status !== "PENDING") return;
    const interval = setInterval(
      () => void refresh().catch(() => undefined),
      3_000,
    );
    return () => clearInterval(interval);
  }, [draft.status, refresh]);
  async function saveConfig() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(base, "PATCH", {
        expectedRevision: draft.revision,
        title,
        type,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        allowedSwitches,
        classroomIds,
      });
      await refresh();
      setMessage("考试设置已保存。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function move(index: number, offset: number) {
    const ids = draft.questions.map((row) => row.id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    setError("");
    try {
      await api(`${base}/order`, "PATCH", {
        expectedRevision: draft.revision,
        questionIds: ids,
      });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "调整失败");
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    setError("");
    try {
      await api(`${base}/retry`, "POST");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "重试失败");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (
      !window.confirm(
        "发布后试卷、题目图片和考试规则会冻结，新题将进入共享题库。确认发布？",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`${base}/publish`, "POST", {
        expectedRevision: draft.revision,
        requestId: requestId.current,
      });
      router.push("/teacher/exams");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }
  const reviewed = draft.questions.filter(
    (row) => row.reviewedRevision === row.revision,
  ).length;
  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">
          解析状态：
          {draft.status === "PENDING"
            ? "处理中"
            : draft.status === "READY"
              ? "待审核"
              : draft.status === "FAILED"
                ? "失败"
                : "已发布"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {draft.sourceFileName} · {draft.questions.length} 题 · 已审核{" "}
          {reviewed} 题
          {draft.status === "PENDING" ? ` · ${draft.job?.progress ?? 0}%` : ""}
        </p>
        {draft.errorCode && (
          <p className="mt-2 text-sm text-red-700">
            {PARSE_ERRORS[draft.errorCode] ?? `解析失败（${draft.errorCode}）`}
          </p>
        )}
        <Link
          className="mt-2 inline-block text-sm text-sky-700 underline"
          href={`${base}/source`}
          target="_blank"
        >
          查看原试卷文件
        </Link>
        {draft.status === "FAILED" && (
          <button
            className="ml-4 rounded border px-3 py-1 text-sm"
            disabled={busy}
            onClick={() => void retry()}
          >
            重试解析
          </button>
        )}
      </section>
      {draft.status === "READY" && (
        <>
          <section className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2">
            <h2 className="font-semibold sm:col-span-2">考试设置</h2>
            <label className="text-sm">
              考试名称
              <input
                className="mt-1 w-full rounded border p-2"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="text-sm">
              考试类型
              <select
                className="mt-1 w-full rounded border p-2"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as Draft["type"])
                }
              >
                <option value="MIDTERM">期中考试</option>
                <option value="FINAL">期末考试</option>
              </select>
            </label>
            <label className="text-sm">
              开考时间
              <input
                className="mt-1 w-full rounded border p-2"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
            <label className="text-sm">
              截止时间
              <input
                className="mt-1 w-full rounded border p-2"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </label>
            <label className="text-sm">
              允许切屏次数
              <input
                className="mt-1 w-full rounded border p-2"
                min="0"
                max="20"
                type="number"
                value={allowedSwitches}
                onChange={(event) =>
                  setAllowedSwitches(Number(event.target.value))
                }
              />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm">参加班级</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {classrooms
                  .filter((item) => item.courseId === draft.courseId)
                  .map((item) => (
                    <label className="text-sm" key={item.id}>
                      <input
                        checked={classroomIds.includes(item.id)}
                        type="checkbox"
                        onChange={(event) =>
                          setClassroomIds((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          )
                        }
                      />{" "}
                      {item.name}
                    </label>
                  ))}
              </div>
            </fieldset>
            <button
              className="w-fit rounded border px-3 py-2 text-sm disabled:opacity-50"
              disabled={busy}
              onClick={() => void saveConfig()}
            >
              保存考试设置
            </button>
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">逐题审核</h2>
            {draft.sourceText && (
              <details className="rounded-xl border bg-white p-4">
                <summary className="cursor-pointer font-medium">
                  展开原文对照
                </summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-50 p-3 text-sm whitespace-pre-wrap">
                  {draft.sourceText.slice(0, 100_000)}
                </pre>
                {draft.sourceText.length > 100_000 && (
                  <p className="mt-2 text-xs text-slate-500">
                    原文较长，这里展示前 10 万字；完整内容请打开原试卷文件。
                  </p>
                )}
              </details>
            )}
            {draft.questions.map((row, index) => (
              <div className="space-y-1" key={row.id}>
                <div className="flex justify-end gap-2 text-xs">
                  <button
                    disabled={busy || index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    上移
                  </button>
                  <button
                    disabled={busy || index === draft.questions.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    下移
                  </button>
                </div>
                <QuestionEditor
                  draftId={draft.id}
                  key={`${row.id}-${row.revision}`}
                  row={row}
                  sourceAssets={draft.assets}
                  sourceFormat={draft.sourceFormat}
                  onChanged={refresh}
                />
              </div>
            ))}
          </section>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="text-sm text-emerald-700" role="status">
              {message}
            </p>
          )}
          <button
            className="rounded bg-sky-700 px-5 py-2 text-white disabled:opacity-50"
            disabled={
              busy ||
              !draft.questions.length ||
              reviewed !== draft.questions.length ||
              !draft.title ||
              !draft.startsAt ||
              !draft.endsAt ||
              !draft.classroomIds.length
            }
            onClick={() => void publish()}
          >
            {busy ? "处理中…" : "审核完成，发布考试"}
          </button>
        </>
      )}
      {draft.status === "PUBLISHED" && (
        <Link className="text-sky-700 underline" href="/teacher/exams">
          查看已发布考试
        </Link>
      )}
      <p className="text-xs text-slate-500">
        AI
        识别、候选答案和图片裁切均须核对。发布时会再次检查三年禁重和课程权限。
      </p>
    </div>
  );
}
