"use client";

import { KnowledgeGraphNodeType, QuestionType } from "@prisma/client";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { requestQuestionApi } from "@/components/questions/request-api";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { QuestionUpsertData } from "@/services/questions/schemas";
import type { ProgrammingConfigRevisionInput } from "@/services/programming-questions/schemas";

interface CourseOption {
  id: string;
  name: string;
  term: string;
  questionCategoryId: string;
  currentPublishedKnowledgeGraphVersion: {
    id: string;
    nodes: Array<{
      id: string;
      conceptId: string;
      code: string;
      name: string;
      nodeType: KnowledgeGraphNodeType;
      sourcePath: string | null;
    }>;
  } | null;
}

interface BatchSummary {
  id: string;
  mode: string;
  status: string;
  requestedCount: number;
  generatedCount: number;
  failedCount: number;
  createdAt: Date | string;
  course: { name: string };
}
interface Candidate {
  id: string;
  ordinal: number;
  status: string;
  revision: number;
  questionJson: QuestionUpsertData;
  primaryConceptId: string | null;
  programmingConfig: ProgrammingConfigRevisionInput | null;
  sourceRefs: Array<{ id: string; locator: string; text: string }>;
  qualityFlags: string[];
  reviewHistory: Array<{
    revision: number;
    questionJson: QuestionUpsertData;
    replacedAt: string;
  }>;
  confirmedQuestionId: string | null;
}
interface BatchDetail {
  id: string;
  courseId: string;
  mode: string;
  status: string;
  requestedCount: number;
  generatedCount: number;
  failedCount: number;
  errorCode: string | null;
  failureDetails: Array<{ ordinal: number; type: QuestionType; code: string }>;
  candidates: Candidate[];
  job: { status: string; progress: number; errorCode: string | null } | null;
}

const TYPES = Object.values(QuestionType);
const BLOOM = [
  ["REMEMBER", "记忆"],
  ["UNDERSTAND", "理解"],
  ["APPLY", "运用"],
  ["ANALYZE", "分析"],
  ["EVALUATE", "评价"],
  ["CREATE", "创造"],
] as const;
const MODES = [
  ["RANGE", "按范围生成"],
  ["ANALOGY", "举一反三"],
  ["FILE", "按文件生成"],
] as const;

function readableAnswer(question: QuestionUpsertData): string {
  const answer = question.answer;
  switch (answer.kind) {
    case "CHOICE":
      return answer.correctOptionLabels
        .map((label) => {
          const option = question.options.find((item) => item.label === label);
          return option ? `${label}. ${option.content}` : label;
        })
        .join("；");
    case "BOOLEAN":
      return answer.value ? "正确" : "错误";
    case "TEXT":
      return answer.acceptableAnswers.join("；");
    case "REFERENCE":
      return answer.value;
    case "PROGRAMMING":
      return "参考代码与测试用例见下方教师审核区";
  }
}

function readableFailure(code: string): string {
  if (code.startsWith("SCHEMA:")) {
    const detail = code.split(":").slice(2).join(":");
    return detail && detail !== "custom"
      ? `AI 返回的题目未通过校验：${detail}`
      : "AI 返回的题目字段不完整或格式无效";
  }
  if (code.startsWith("PROVIDER:"))
    return "AI 服务请求失败，请检查服务状态后重试";
  if (code === "REVIEW_REJECTED") return "AI 复核发现事实、答案或表述问题";
  const messages: Record<string, string> = {
    题目数量与请求不一致: "AI 返回的题目数量不符",
    题型或难度与请求不一致: "题型或难度不符合设置",
    选项数量与请求不一致: "选项数量不符合设置",
    编程判题配置缺失或多余: "编程题判题配置无效",
    "编程题测试用例超过 10 个": "编程题测试用例过多",
    引用了不存在的证据: "题目引用的来源不存在",
    生成题与现有题重复: "题干与本批或题库已有题目重复",
    题干包含来源提示: "题干包含不适合学生阅读的来源提示",
    主知识点不在正式图谱范围内: "主知识点不属于本次正式图谱范围",
  };
  return messages[code] ?? "生成结果未通过校验，请重试";
}

function initialCounts(): Record<QuestionType, number> {
  return Object.fromEntries(
    TYPES.map((type) => [type, type === QuestionType.SINGLE_CHOICE ? 1 : 0]),
  ) as Record<QuestionType, number>;
}

export function AIQuestionWorkspace({
  options,
  initialBatches,
}: {
  options: {
    courses: CourseOption[];
    sourceQuestions: Array<{
      id: string;
      questionCategoryId: string | null;
      title: string;
      type: QuestionType;
    }>;
  };
  initialBatches: BatchSummary[];
}) {
  const [courseId, setCourseId] = useState(options.courses[0]?.id ?? "");
  const [mode, setMode] = useState<"RANGE" | "ANALOGY" | "FILE">("RANGE");
  const [chapterCode, setChapterCode] = useState("");
  const [conceptIds, setConceptIds] = useState<string[]>([]);
  const [sourceQuestionId, setSourceQuestionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [bloomLevel, setBloomLevel] =
    useState<(typeof BLOOM)[number][0]>("REMEMBER");
  const [difficulty, setDifficulty] = useState(3);
  const [counts, setCounts] = useState(initialCounts);
  const [singleChoiceOptions, setSingleChoiceOptions] = useState(4);
  const [multipleChoiceOptions, setMultipleChoiceOptions] = useState(4);
  const [batches, setBatches] = useState(initialBatches);
  const [batchId, setBatchId] = useState("");
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deletingBatchId, setDeletingBatchId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [conceptSelections, setConceptSelections] = useState<
    Record<string, string>
  >({});
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});
  const course = options.courses.find((item) => item.id === courseId);
  const chapters =
    course?.currentPublishedKnowledgeGraphVersion?.nodes.filter(
      (node) => node.nodeType === "CHAPTER",
    ) ?? [];
  const concepts =
    course?.currentPublishedKnowledgeGraphVersion?.nodes.filter(
      (node) =>
        node.nodeType === "KNOWLEDGE_POINT" &&
        (!chapterCode ||
          node.sourcePath?.startsWith(
            `${chapters.find((chapter) => chapter.code === chapterCode)?.sourcePath}.`,
          )),
    ) ?? [];
  const sourceQuestions = options.sourceQuestions.filter(
    (item) => item.questionCategoryId === course?.questionCategoryId,
  );
  const total = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts],
  );

  async function loadBatch(id: string) {
    const result = await requestQuestionApi<BatchDetail>(
      `/api/teacher/ai-question-batches/${id}`,
      { cache: "no-store" },
    );
    if (result.success) setBatch(result.data);
    else setError(result.error);
  }

  useEffect(() => {
    if (!batchId) return;
    setEditingIds({});
    setConceptSelections({});
    void loadBatch(batchId);
    const interval = setInterval(() => void loadBatch(batchId), 3_000);
    return () => clearInterval(interval);
  }, [batchId]);

  async function generate() {
    setError("");
    setNotice("");
    if (!courseId || total < 1 || total > 20) {
      setError("请选择课程，并设置 1–20 道题");
      return;
    }
    if (mode === "RANGE" && !course?.currentPublishedKnowledgeGraphVersion) {
      setError("该课程尚未发布正式知识图谱");
      return;
    }
    if (mode === "ANALOGY" && !sourceQuestionId) {
      setError("请选择原题");
      return;
    }
    if (mode === "FILE" && !file) {
      setError("请选择出题文件");
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set(
      "request",
      JSON.stringify({
        courseId,
        mode,
        chapterCode: chapterCode || null,
        conceptIds,
        sourceQuestionId: mode === "ANALOGY" ? sourceQuestionId : null,
        bloomLevel,
        difficulty,
        counts,
        singleChoiceOptions,
        multipleChoiceOptions,
        idempotencyKey: crypto.randomUUID(),
      }),
    );
    if (mode === "FILE" && file) form.set("file", file);
    const result = await requestQuestionApi<{ id: string }>(
      "/api/teacher/ai-question-batches",
      { method: "POST", body: form },
    );
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setBatchId(result.data.id);
    setNotice("任务已入队。生成结果会出现在下方审核区。");
    const refreshed = await requestQuestionApi<BatchSummary[]>(
      "/api/teacher/ai-question-batches",
    );
    if (refreshed.success) setBatches(refreshed.data);
  }

  async function retry() {
    if (!batchId) return;
    setBusy(true);
    setError("");
    const result = await requestQuestionApi<{ id: string }>(
      `/api/teacher/ai-question-batches/${batchId}/retry`,
      { method: "POST" },
    );
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setNotice("已重新入队，只补齐尚未生成的题目。");
    await loadBatch(batchId);
  }

  async function deleteBatch(item: BatchSummary) {
    const active = item.status === "PENDING" || item.status === "RUNNING";
    if (
      !window.confirm(
        `确定从最近出题任务中移除这条任务吗？已入库题目不会删除。${active ? "正在生成的任务仍会继续处理。" : ""}`,
      )
    )
      return;
    setDeletingBatchId(item.id);
    setDeleteError("");
    const result = await requestQuestionApi<{ deleted: boolean }>(
      `/api/teacher/ai-question-batches/${item.id}`,
      { method: "DELETE" },
    );
    setDeletingBatchId("");
    if (!result.success) {
      setDeleteError(result.error);
      return;
    }
    const refreshed = await requestQuestionApi<BatchSummary[]>(
      "/api/teacher/ai-question-batches",
      { cache: "no-store" },
    );
    setBatches((current) =>
      refreshed.success
        ? refreshed.data
        : current.filter((batch) => batch.id !== item.id),
    );
    if (batchId === item.id) {
      setBatchId("");
      setBatch(null);
      setError("");
    }
    setNotice("任务已从最近列表移除，已入库题目保留。");
  }

  async function confirmAll() {
    if (!batch) return;
    if (Object.values(editingIds).some(Boolean)) {
      setError("请先保存或取消正在修改的题目，再批量入库");
      return;
    }
    const pending = batch.candidates.filter((item) => item.status === "REVIEW");
    if (
      !pending.length ||
      !window.confirm(
        `已审核全部 ${pending.length} 道候选题，并确认一键入库吗？`,
      )
    )
      return;
    setBusy(true);
    setError("");
    const result = await requestQuestionApi<{
      confirmedCount: number;
      failed: Array<{ id: string; reason: string }>;
    }>(`/api/teacher/ai-question-batches/${batch.id}/confirm-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidates: pending.map((item) => ({
          id: item.id,
          expectedRevision: item.revision,
          primaryConceptId:
            conceptSelections[item.id] === undefined
              ? item.primaryConceptId
              : conceptSelections[item.id] || null,
        })),
      }),
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setNotice(
      `已入库 ${result.data.confirmedCount} 道题${result.data.failed.length ? `，${result.data.failed.length} 道未入库，请检查后重试` : ""}。`,
    );
    if (result.data.failed.length)
      setError(
        result.data.failed
          .map(
            (item) =>
              `第 ${batch.candidates.find((candidate) => candidate.id === item.id)?.ordinal ?? "?"} 题：${item.reason}`,
          )
          .join("；"),
      );
    await loadBatch(batch.id);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.5fr)]">
      <div className="space-y-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-6 flex items-center gap-3 text-sm font-semibold">
            <span className="grid size-8 place-items-center rounded-full bg-sky-600 text-white">
              1
            </span>{" "}
            出题要求 <span className="h-px flex-1 bg-slate-200" />
            <span className="grid size-8 place-items-center rounded-full bg-slate-200 text-slate-600">
              2
            </span>{" "}
            候选题审核
          </div>
          {!options.courses.length ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              当前没有可用的本人课程，请先创建课程并确认课程分类可用。
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              课程
              <select
                className="w-full rounded-lg border p-2"
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setChapterCode("");
                  setConceptIds([]);
                  setSourceQuestionId("");
                }}
              >
                {options.courses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.term}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              目录归属
              <select
                className="w-full rounded-lg border p-2"
                value={chapterCode}
                onChange={(event) => {
                  setChapterCode(event.target.value);
                  setConceptIds([]);
                }}
              >
                <option value="">根目录（当前课程范围）</option>
                {chapters.map((item) => (
                  <option key={item.id} value={item.code}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h2 className="mt-6 text-base font-semibold">出题设置</h2>
          <div
            className="mt-3 flex flex-wrap gap-3"
            role="radiogroup"
            aria-label="出题模式"
          >
            {MODES.map(([value, label]) => (
              <label
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${mode === value ? "border-sky-500 bg-sky-50 text-sky-800" : "border-slate-200"}`}
                key={value}
              >
                <input
                  className="mr-2"
                  type="radio"
                  name="mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {mode === "ANALOGY" ? (
            <label className="mt-4 block space-y-1 text-sm">
              选择当前课程分类的原题
              <select
                className="w-full rounded-lg border p-2"
                value={sourceQuestionId}
                onChange={(event) => setSourceQuestionId(event.target.value)}
              >
                <option value="">请选择</option>
                {sourceQuestions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {QUESTION_TYPE_LABELS[item.type]} · {item.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {mode === "FILE" ? (
            <label className="mt-4 block space-y-1 text-sm">
              上传课程资料（PDF、DOCX、DOC、TXT，最多 20 MB）
              <input
                className="block w-full rounded-lg border p-2"
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <span className="block text-xs text-slate-500">
                仅本次任务使用；原文件私有保存，结束 30 天后清理。
              </span>
            </label>
          ) : null}
          <fieldset className="mt-5">
            <legend className="text-sm font-medium">
              考察的知识点（可多选）
            </legend>
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border p-3">
              {concepts.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {concepts.map((item) => (
                    <label key={item.id} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={conceptIds.includes(item.conceptId)}
                        onChange={(event) =>
                          setConceptIds(
                            event.target.checked
                              ? [...conceptIds, item.conceptId]
                              : conceptIds.filter(
                                  (id) => id !== item.conceptId,
                                ),
                          )
                        }
                      />
                      {item.code} · {item.name}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  此课程暂无可选正式知识点；文件和变式模式仍可在根目录出题。
                </p>
              )}
            </div>
          </fieldset>
          <fieldset className="mt-5">
            <legend className="text-sm font-medium">题目层级</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {BLOOM.map(([value, label]) => (
                <label key={value} className="text-sm">
                  <input
                    className="mr-1"
                    type="radio"
                    checked={bloomLevel === value}
                    onChange={() => setBloomLevel(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-5 block max-w-xs space-y-1 text-sm">
            难度
            <select
              className="w-full rounded-lg border p-2"
              value={difficulty}
              onChange={(event) => setDifficulty(Number(event.target.value))}
            >
              {[1, 2, 3, 4, 5].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-5">
            <h3 className="text-sm font-medium">
              题目数量{" "}
              <span className="font-normal text-slate-500">
                （合计 {total}/20）
              </span>
            </h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {TYPES.map((type) => (
                <label
                  key={type}
                  className="flex items-center justify-between gap-3 rounded-lg border p-2 text-sm"
                >
                  <span>{QUESTION_TYPE_LABELS[type]}</span>
                  <input
                    aria-label={`${QUESTION_TYPE_LABELS[type]}数量`}
                    className="w-20 rounded border p-1 text-center"
                    type="number"
                    min={0}
                    max={10}
                    value={counts[type]}
                    onChange={(event) =>
                      setCounts({
                        ...counts,
                        [type]: Number(event.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              单选题选项数
              <input
                className="mt-1 block w-full rounded-lg border p-2"
                type="number"
                min={2}
                max={6}
                value={singleChoiceOptions}
                onChange={(event) =>
                  setSingleChoiceOptions(Number(event.target.value))
                }
              />
            </label>
            <label className="text-sm">
              多选题选项数
              <input
                className="mt-1 block w-full rounded-lg border p-2"
                type="number"
                min={2}
                max={6}
                value={multipleChoiceOptions}
                onChange={(event) =>
                  setMultipleChoiceOptions(Number(event.target.value))
                }
              />
            </label>
          </div>
          <button
            className="mt-6 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            type="button"
            disabled={busy || !courseId}
            onClick={() => void generate()}
          >
            {busy ? "提交中…" : "生成候选题"}
          </button>
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
          >
            {notice}
          </p>
        ) : null}
        {batch ? (
          <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">候选题审核</h2>
                <p className="text-sm text-slate-600">
                  任务 {batch.status} · 已生成 {batch.generatedCount}/
                  {batch.requestedCount} · 失败 {batch.failedCount}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {batch.status === "FAILED" || batch.status === "PARTIAL" ? (
                  <button
                    className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void retry()}
                  >
                    重试未完成题目
                  </button>
                ) : null}
                {(batch.status === "READY" || batch.status === "PARTIAL") &&
                batch.candidates.some((item) => item.status === "REVIEW") ? (
                  <button
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={busy || Object.values(editingIds).some(Boolean)}
                    onClick={() => void confirmAll()}
                  >
                    审核后全部入库（
                    {
                      batch.candidates.filter(
                        (item) => item.status === "REVIEW",
                      ).length
                    }
                    ）
                  </button>
                ) : null}
                {batch.candidates.some(
                  (item) =>
                    item.status === "CONFIRMED" && item.confirmedQuestionId,
                ) ? (
                  <Link
                    className="inline-flex items-center rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                    href={`/teacher/courses/${batch.courseId}/question-mapping`}
                  >
                    前往题目关联
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-sky-500"
                style={{ width: `${batch.job?.progress ?? 0}%` }}
              />
            </div>
            {batch.errorCode ? (
              <p role="alert" className="text-sm text-amber-700">
                {batch.errorCode === "SOME_QUESTIONS_FAILED"
                  ? `${batch.failedCount} 道题未通过生成或校验，已生成的题可继续审核；点击“重试未完成题目”补齐。`
                  : `错误代码：${batch.errorCode}。请核对设置或重试。`}
              </p>
            ) : null}
            {batch.failureDetails.length ? (
              <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  查看未完成题目原因
                </summary>
                <ul className="mt-2 space-y-1">
                  {batch.failureDetails.map((item) => (
                    <li key={item.ordinal}>
                      第 {item.ordinal} 题 · {QUESTION_TYPE_LABELS[item.type]}：
                      {readableFailure(item.code)}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {!batch.candidates.length ? (
              <p className="rounded-lg border border-dashed p-6 text-sm text-slate-500">
                {batch.status === "PENDING" || batch.status === "RUNNING"
                  ? "任务处理中，完成后会自动显示候选题。"
                  : "暂无可审核的候选题。"}
              </p>
            ) : (
              batch.candidates.map((item) => (
                <CandidateReview
                  key={`${item.id}:${item.revision}`}
                  candidate={item}
                  batchId={batch.id}
                  graphNodes={
                    options.courses
                      .find((entry) => entry.id === batch.courseId)
                      ?.currentPublishedKnowledgeGraphVersion?.nodes.filter(
                        (node) => node.nodeType === "KNOWLEDGE_POINT",
                      ) ?? []
                  }
                  onChange={() => void loadBatch(batch.id)}
                  onError={setError}
                  selectedConceptId={
                    conceptSelections[item.id] === undefined
                      ? (item.primaryConceptId ?? "")
                      : conceptSelections[item.id]
                  }
                  onConceptChange={(value) =>
                    setConceptSelections((current) => ({
                      ...current,
                      [item.id]: value,
                    }))
                  }
                  onEditingChange={(editing) =>
                    setEditingIds((current) => ({
                      ...current,
                      [item.id]: editing,
                    }))
                  }
                />
              ))
            )}
          </div>
        ) : null}
      </div>
      <aside className="self-start rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">最近的出题任务</h2>
        {deleteError ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {deleteError}
          </p>
        ) : null}
        <div className="mt-3 space-y-2">
          {batches.length ? (
            batches.map((item) => (
              <div key={item.id} className="group relative">
                <button
                  type="button"
                  disabled={deletingBatchId === item.id}
                  onClick={() => {
                    setBatchId(item.id);
                    setError("");
                  }}
                  className={`block w-full rounded-lg border p-3 pr-12 text-left text-sm hover:bg-slate-50 ${batchId === item.id ? "border-sky-500 bg-sky-50" : ""}`}
                >
                  <span className="block font-medium">
                    {item.course.name} ·{" "}
                    {MODES.find(([value]) => value === item.mode)?.[1] ??
                      item.mode}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {item.status} · {item.generatedCount}/{item.requestedCount}{" "}
                    · {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`删除${item.course.name}的出题任务`}
                  title="删除任务"
                  disabled={Boolean(deletingBatchId)}
                  onClick={() => void deleteBatch(item)}
                  className="absolute top-2 right-2 rounded-md p-1.5 text-red-600 opacity-100 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">还没有 AI 出题任务。</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function CandidateReview({
  candidate,
  batchId,
  graphNodes,
  onChange,
  onError,
  selectedConceptId,
  onConceptChange,
  onEditingChange,
}: {
  candidate: Candidate;
  batchId: string;
  graphNodes: Array<{
    id: string;
    conceptId: string;
    code: string;
    name: string;
  }>;
  onChange: () => void;
  onError: (message: string) => void;
  selectedConceptId: string;
  onConceptChange: (value: string) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState<QuestionUpsertData>(
    candidate.questionJson,
  );
  const [configText, setConfigText] = useState(
    candidate.programmingConfig
      ? JSON.stringify(candidate.programmingConfig, null, 2)
      : "",
  );
  const [busy, setBusy] = useState(false);
  const base = `/api/teacher/ai-question-batches/${batchId}/candidates/${candidate.id}`;
  async function action(
    path: string,
    body: unknown,
    method: "POST" | "PATCH" = "POST",
  ) {
    setBusy(true);
    onError("");
    const result = await requestQuestionApi<unknown>(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!result.success) {
      onError(result.error);
      return false;
    }
    onChange();
    return true;
  }
  async function save() {
    let programmingConfig: unknown = null;
    if (question.type === QuestionType.PYTHON_PROGRAMMING) {
      try {
        programmingConfig = JSON.parse(configText);
      } catch {
        onError("判题配置 JSON 格式错误");
        return;
      }
    }
    if (
      await action(
        "",
        {
          expectedRevision: candidate.revision,
          question,
          programmingConfig,
          sourceIds: candidate.sourceRefs.map((item) => item.id),
        },
        "PATCH",
      )
    ) {
      setEditing(false);
      onEditingChange(false);
    }
  }
  return (
    <article className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>第 {candidate.ordinal} 题</span>
        <span>{QUESTION_TYPE_LABELS[candidate.questionJson.type]}</span>
        <span>难度 {candidate.questionJson.difficulty}</span>
        <span>{candidate.status}</span>
      </div>
      {candidate.status === "CONFIRMED" ? (
        <Link
          className="mt-2 inline-block font-semibold text-sky-700 underline"
          href={`/teacher/questions/${candidate.confirmedQuestionId}`}
        >
          查看已入库题目：{candidate.questionJson.title}
        </Link>
      ) : (
        <h3 className="mt-2 font-semibold">{candidate.questionJson.title}</h3>
      )}
      {editing ? (
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            标题
            <input
              className="mt-1 w-full rounded border p-2"
              value={question.title}
              onChange={(event) =>
                setQuestion({ ...question, title: event.target.value })
              }
            />
          </label>
          <label className="block">
            题干
            <textarea
              className="mt-1 min-h-24 w-full rounded border p-2"
              value={question.content}
              onChange={(event) =>
                setQuestion({ ...question, content: event.target.value })
              }
            />
          </label>
          {question.options.length ? (
            <label className="block">
              选项（每行一个；修改后保持选项数）
              <textarea
                className="mt-1 min-h-24 w-full rounded border p-2"
                value={question.options.map((item) => item.content).join("\n")}
                onChange={(event) => {
                  const lines = event.target.value.split("\n");
                  setQuestion({
                    ...question,
                    options: question.options.map((item, index) => ({
                      ...item,
                      content: lines[index] ?? "",
                    })),
                  });
                }}
              />
            </label>
          ) : null}
          {question.answer.kind === "CHOICE" ? (
            <fieldset className="rounded border p-3">
              <legend className="font-medium">正确选项</legend>
              <div className="mt-2 space-y-2">
                {question.options.map((option) => (
                  <label key={option.label} className="flex items-center gap-2">
                    <input
                      type={
                        question.type === QuestionType.SINGLE_CHOICE
                          ? "radio"
                          : "checkbox"
                      }
                      name={`answer-${candidate.id}`}
                      checked={
                        question.answer.kind === "CHOICE" &&
                        question.answer.correctOptionLabels.includes(
                          option.label,
                        )
                      }
                      onChange={(event) => {
                        const labels =
                          question.answer.kind === "CHOICE"
                            ? question.answer.correctOptionLabels
                            : [];
                        setQuestion({
                          ...question,
                          answer: {
                            kind: "CHOICE",
                            correctOptionLabels:
                              question.type === QuestionType.SINGLE_CHOICE
                                ? [option.label]
                                : event.target.checked
                                  ? [...labels, option.label]
                                  : labels.filter(
                                      (label) => label !== option.label,
                                    ),
                          },
                        });
                      }}
                    />
                    {option.label}. {option.content}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : question.answer.kind === "BOOLEAN" ? (
            <label className="block">
              正确答案
              <select
                className="mt-1 block rounded border p-2"
                value={String(question.answer.value)}
                onChange={(event) =>
                  setQuestion({
                    ...question,
                    answer: {
                      kind: "BOOLEAN",
                      value: event.target.value === "true",
                    },
                  })
                }
              >
                <option value="true">正确</option>
                <option value="false">错误</option>
              </select>
            </label>
          ) : question.answer.kind === "TEXT" ? (
            <label className="block">
              可接受答案（每行一个）
              <textarea
                className="mt-1 min-h-20 w-full rounded border p-2"
                value={question.answer.acceptableAnswers.join("\n")}
                onChange={(event) =>
                  setQuestion({
                    ...question,
                    answer: {
                      kind: "TEXT",
                      acceptableAnswers: event.target.value
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean),
                      caseSensitive:
                        question.answer.kind === "TEXT"
                          ? question.answer.caseSensitive
                          : false,
                    },
                  })
                }
              />
            </label>
          ) : question.answer.kind === "REFERENCE" ? (
            <label className="block">
              参考答案
              <textarea
                className="mt-1 min-h-24 w-full rounded border p-2"
                value={question.answer.value}
                onChange={(event) =>
                  setQuestion({
                    ...question,
                    answer: { kind: "REFERENCE", value: event.target.value },
                  })
                }
              />
            </label>
          ) : (
            <p>编程题答案由下方参考代码和用例确定。</p>
          )}
          <label className="block">
            解析
            <textarea
              className="mt-1 min-h-20 w-full rounded border p-2"
              value={question.explanation}
              onChange={(event) =>
                setQuestion({ ...question, explanation: event.target.value })
              }
            />
          </label>
          <label className="block">
            标签（用逗号分隔）
            <input
              className="mt-1 w-full rounded border p-2"
              value={question.tags.join(",")}
              onChange={(event) =>
                setQuestion({
                  ...question,
                  tags: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          {question.type === QuestionType.PYTHON_PROGRAMMING ? (
            <label className="block">
              判题配置 JSON（含参考代码、公开样例与隐藏用例）
              <textarea
                className="mt-1 min-h-64 w-full rounded border p-2 font-mono text-xs"
                value={configText}
                onChange={(event) => setConfigText(event.target.value)}
              />
            </label>
          ) : null}
          <button
            disabled={busy}
            className="rounded bg-sky-600 px-3 py-2 text-white"
            onClick={() => void save()}
          >
            保存修改
          </button>
          <button
            className="ml-2 rounded border px-3 py-2"
            onClick={() => {
              setEditing(false);
              onEditingChange(false);
            }}
          >
            取消
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p className="whitespace-pre-wrap">
            {candidate.questionJson.content}
          </p>
          {candidate.questionJson.options.length ? (
            <ol className="space-y-1">
              {candidate.questionJson.options.map((option) => (
                <li key={option.label}>
                  {option.label}. {option.content}
                </li>
              ))}
            </ol>
          ) : null}
          <p>
            <strong>答案：</strong>
            {readableAnswer(candidate.questionJson)}
          </p>
          <p>
            <strong>解析：</strong>
            {candidate.questionJson.explanation}
          </p>
          {candidate.programmingConfig ? (
            <details className="rounded bg-slate-50 p-2">
              <summary className="cursor-pointer">
                参考代码与测试用例（教师审核）
              </summary>
              <pre className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap">
                {JSON.stringify(candidate.programmingConfig, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      )}
      <details className="mt-3 rounded-lg bg-slate-50 p-2 text-xs">
        <summary className="cursor-pointer font-medium">
          生成依据与质量提示
        </summary>
        <ul className="mt-2 space-y-2">
          {candidate.sourceRefs.map((item) => (
            <li key={item.id}>
              <strong>{item.locator}</strong>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
        {candidate.qualityFlags.map((flag) => (
          <p className="text-amber-700" key={flag}>
            {flag}
          </p>
        ))}
      </details>
      {candidate.reviewHistory.length ? (
        <details className="mt-3 rounded-lg border p-2 text-xs">
          <summary className="cursor-pointer font-medium">
            已保存的审核修订（{candidate.reviewHistory.length}）
          </summary>
          <ol className="mt-2 space-y-2">
            {candidate.reviewHistory.map((item) => (
              <li key={item.revision} className="rounded bg-slate-50 p-2">
                <details>
                  <summary className="cursor-pointer">
                    修订 {item.revision} · {item.questionJson.title} ·{" "}
                    {new Date(item.replacedAt).toLocaleString("zh-CN")}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap">
                    {item.questionJson.content}
                  </p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(item.questionJson.answer, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {candidate.status === "REVIEW" && !editing ? (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            主知识点（AI 默认识别，可调整）
            <select
              className="mt-1 block max-w-64 rounded border p-2 text-sm"
              value={selectedConceptId}
              onChange={(event) => onConceptChange(event.target.value)}
            >
              <option value="">不绑定</option>
              {graphNodes.map((node) => (
                <option key={node.id} value={node.conceptId}>
                  {node.code} · {node.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => {
              setEditing(true);
              onEditingChange(true);
            }}
          >
            修改
          </button>
          <button
            disabled={busy}
            className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            onClick={() =>
              void action("/confirm", {
                expectedRevision: candidate.revision,
                primaryConceptId: selectedConceptId || null,
              })
            }
          >
            确认入库
          </button>
          <button
            disabled={busy}
            className="rounded border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
            onClick={() => {
              if (window.confirm("确定丢弃这道候选题？"))
                void action("/discard", {
                  expectedRevision: candidate.revision,
                });
            }}
          >
            丢弃
          </button>
        </div>
      ) : null}
    </article>
  );
}
