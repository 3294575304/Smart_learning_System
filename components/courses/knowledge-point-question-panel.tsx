"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { requestApi } from "@/components/courses/request-api";
import { planKnowledgePointBindingChange } from "@/components/courses/knowledge-point-binding-change";
import type {
  GraphConceptQuestions,
  GraphQuestionPoint,
  QuestionGraphBindingState,
} from "@/services/question-graph-bindings/types";
import {
  QUESTION_TYPE_LABELS,
  QUESTION_STATUS_LABELS,
} from "@/services/questions/constants";

type QuestionItem = GraphConceptQuestions["items"][number];

export function KnowledgePointQuestionPanel({
  courseId,
  graphVersionId,
  point,
  onChanged,
}: {
  courseId: string;
  graphVersionId: string;
  point: GraphQuestionPoint;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"BOUND" | "AVAILABLE">("BOUND");
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<GraphConceptQuestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<QuestionItem | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      graphVersionId,
      mode,
      keyword: search,
      page: String(page),
      pageSize: "8",
    });
    void requestApi<GraphConceptQuestions>(
      `/api/teacher/courses/${courseId}/knowledge-graph/concepts/${point.conceptId}/questions?${query}`,
      { signal: controller.signal },
    ).then((response) => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (response.success) setResult(response.data);
      else {
        setResult(null);
        setError(response.error);
      }
    });
    return () => controller.abort();
  }, [courseId, point.conceptId, graphVersionId, mode, search, page, refresh]);

  return (
    <section
      className="mt-4 space-y-3 border-t pt-4"
      aria-label="知识点关联题目"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="font-semibold">
          关联题目{" "}
          <span className="text-emerald-700">{point.questionCount} 道</span>
        </h5>
        <Link
          className="text-xs text-sky-700 underline"
          href={`/teacher/courses/${courseId}/question-mapping`}
          target="_blank"
          rel="noreferrer"
        >
          AI 批量匹配与审核 ↗
        </Link>
      </div>
      <p className="text-xs leading-5 text-gray-500">
        题目可关联多个知识点，区分主要考查与次要涉及。仅显示您可管理的题目。
      </p>
      <div className="flex gap-2" role="group" aria-label="题目范围">
        {(
          [
            ["BOUND", "已关联题目"],
            ["AVAILABLE", "从我的题库添加"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className={`rounded-md border px-3 py-2 text-xs ${mode === value ? "border-sky-600 bg-sky-50 text-sky-800" : ""}`}
            onClick={() => {
              setMode(value);
              setPage(1);
              setSelected(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(keyword.trim());
          setPage(1);
          setRefresh((value) => value + 1);
        }}
      >
        <input
          aria-label="搜索题目标题或题干"
          placeholder="输入题目标题或题干关键词"
          className="min-w-0 flex-1 rounded border px-2 py-2 text-sm"
          maxLength={120}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <button type="submit" className="rounded border px-3 text-sm">
          查找
        </button>
      </form>
      {notice ? (
        <p
          role="status"
          className="rounded bg-emerald-50 p-2 text-xs text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              onChanged();
              setRefresh((value) => value + 1);
            }}
          >
            刷新重试
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="py-4 text-sm text-gray-500">正在读取题目…</p>
      ) : result ? (
        <>
          {result.items.length === 0 ? (
            <p className="rounded border border-dashed p-4 text-sm leading-6 text-gray-500">
              {search
                ? "没有找到匹配题目，请换一个关键词。"
                : mode === "BOUND"
                  ? "该知识点尚未关联题目，可从“我的题库”添加。"
                  : "暂无可添加的题目。您可以先在题库创建题目，或复制公共题目到我的题库。"}
            </p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {result.items.map((question) => (
                <li
                  className="rounded-lg border bg-white p-3"
                  key={question.id}
                >
                  <Link
                    href={`/teacher/questions/${question.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="leading-6 font-medium text-sky-800 hover:underline"
                  >
                    {question.title} ↗
                  </Link>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 whitespace-pre-wrap text-gray-600">
                    {question.content}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>{QUESTION_TYPE_LABELS[question.type]}</span>
                    <span>难度 {question.difficulty}/5</span>
                    <span>{QUESTION_STATUS_LABELS[question.status]}</span>
                    {question.bindingType ? (
                      <span className="text-emerald-700">
                        {question.bindingType === "PRIMARY"
                          ? "主要考查"
                          : "次要涉及"}{" "}
                        · 来源 v{question.sourceVersionNumber}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="mt-2 rounded border px-3 py-1.5 text-xs text-sky-800"
                    onClick={() => {
                      setSelected(question);
                      setNotice(null);
                    }}
                  >
                    {question.bindingType ? "调整或移除关联" : "关联此题"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              共 {result.pagination.total} 道 · 第 {page}/
              {Math.max(1, result.pagination.totalPages)} 页
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                className="rounded border px-2 py-1 disabled:opacity-40"
                onClick={() => setPage((value) => value - 1)}
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page >= result.pagination.totalPages}
                className="rounded border px-2 py-1 disabled:opacity-40"
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        </>
      ) : null}
      {selected ? (
        <PointBindingEditor
          key={selected.id}
          courseId={courseId}
          graphVersionId={graphVersionId}
          point={point}
          question={selected}
          onCancel={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            setNotice("题目关联已保存，历史作业与成绩不受影响。");
            setPage(1);
            setRefresh((value) => value + 1);
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}

function PointBindingEditor({
  courseId,
  graphVersionId,
  point,
  question,
  onCancel,
  onSaved,
}: {
  courseId: string;
  graphVersionId: string;
  point: GraphQuestionPoint;
  question: QuestionItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [binding, setBinding] = useState<QuestionGraphBindingState | null>(
    null,
  );
  const [type, setType] = useState<"PRIMARY" | "SECONDARY">("SECONDARY");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBinding(null);
    setError(null);
    void requestApi<QuestionGraphBindingState>(
      `/api/teacher/questions/${question.id}/knowledge-graph-bindings?courseId=${courseId}`,
      { signal: controller.signal },
    ).then((response) => {
      if (controller.signal.aborted) return;
      if (!response.success) return setError(response.error);
      setBinding(response.data);
      setType(
        response.data.bindings.find(
          (item) => item.conceptId === point.conceptId,
        )?.type ??
          (response.data.bindings.some((item) => item.type === "PRIMARY")
            ? "SECONDARY"
            : "PRIMARY"),
      );
    });
    return () => controller.abort();
  }, [courseId, question.id, point.conceptId, refresh]);

  const current = binding?.bindings.find(
    (item) => item.conceptId === point.conceptId,
  );
  const otherPrimary = binding?.bindings.find(
    (item) => item.type === "PRIMARY" && item.conceptId !== point.conceptId,
  );
  const needsReview = binding?.bindings.some((item) => !item.currentNode);
  async function save(remove: boolean) {
    if (!binding || saving) return;
    if (
      remove &&
      !window.confirm(
        `确认移除“${question.title}”与“${point.name}”的关联？其他知识点关联将保留。`,
      )
    )
      return;
    setError(null);
    let input;
    try {
      input = planKnowledgePointBindingChange(
        binding,
        courseId,
        graphVersionId,
        point,
        remove ? null : type,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请检查关联信息。");
      return;
    }
    setSaving(true);
    const response = await requestApi<QuestionGraphBindingState>(
      `/api/teacher/questions/${question.id}/knowledge-graph-bindings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    setSaving(false);
    if (!response.success) return setError(response.error);
    onSaved();
  }
  return (
    <div
      className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3"
      aria-label="确认知识点关联"
    >
      <p className="font-medium">{question.title}</p>
      <p className="text-sm">关联到：{point.name}</p>
      {!binding && !error ? (
        <p className="text-sm">正在读取已有知识点关联…</p>
      ) : null}
      {binding ? (
        <>
          <label className="block text-sm">
            考查关系
            <select
              className="mt-1 w-full rounded border bg-white px-2 py-2"
              value={type}
              disabled={saving}
              onChange={(event) =>
                setType(event.target.value as "PRIMARY" | "SECONDARY")
              }
            >
              <option value="PRIMARY">主要考查（每题一个）</option>
              <option value="SECONDARY">次要涉及（可多个）</option>
            </select>
          </label>
          {type === "PRIMARY" && otherPrimary ? (
            <p className="text-xs leading-5 text-amber-800">
              保存后，原主要知识点“
              {otherPrimary.currentNode?.name ?? otherPrimary.sourceNode.name}
              ”将改为次要涉及。
            </p>
          ) : null}
          <p className="text-xs leading-5 text-gray-600">
            本题在该课程已有 {binding.bindings.length}{" "}
            个关联。保存会使用当前正式图谱版本，保留其余知识点关联。
          </p>
          {needsReview ? (
            <p className="text-xs text-amber-800">
              有历史知识点未解析到当前版本，请先
              <Link
                className="underline"
                href={`/teacher/questions/${question.id}/edit`}
                target="_blank"
                rel="noreferrer"
              >
                进入题目编辑页审核 ↗
              </Link>
              。
            </p>
          ) : null}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}{" "}
          <button
            type="button"
            className="underline"
            disabled={saving}
            onClick={() => setRefresh((value) => value + 1)}
          >
            重新读取
          </button>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!binding || saving || needsReview}
          className="rounded bg-sky-700 px-3 py-2 text-xs text-white disabled:opacity-40"
          onClick={() => void save(false)}
        >
          {saving ? "保存中…" : "确认保存关联"}
        </button>
        {current ? (
          <button
            type="button"
            disabled={saving || needsReview}
            className="rounded border bg-white px-3 py-2 text-xs text-red-700 disabled:opacity-40"
            onClick={() => void save(true)}
          >
            移除此关联
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving}
          className="rounded border px-3 py-2 text-xs"
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </div>
  );
}
