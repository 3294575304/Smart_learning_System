"use client";

import { useCallback, useEffect, useState } from "react";

import type { AssessmentSchemeStructure } from "@/services/assessment-schemes/schemas";

interface Workspace {
  currentPublishedSyllabusStructureId: string | null;
  currentPublishedAssessmentSchemeId: string | null;
  draft: {
    id: string;
    revisionNumber: number;
    sourcePublishedSyllabusStructureId: string | null;
    structure: AssessmentSchemeStructure;
  } | null;
  reviews: Array<{
    id: string;
    revisionNumber: number;
    sourcePublishedSyllabusStructureId: string | null;
    createdAt: string;
  }>;
  current: {
    id: string;
    versionNumber: number;
    isSourceOutdated: boolean;
    publishedAt: string;
  } | null;
  history: Array<{
    id: string;
    versionNumber: number;
    isSourceOutdated: boolean;
    publishedAt: string;
  }>;
}

const SOURCE_OPTIONS = [
  ["PLATFORM_ASSIGNMENT", "平台作业"],
  ["ATTENDANCE", "考勤"],
  ["MANUAL", "人工录入"],
  ["TEMPLATE_IMPORT", "模板导入"],
] as const;

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? "请求失败，请稍后重试。");
  }
  return payload.data;
}

export function AssessmentSchemeWorkspace({ courseId }: { courseId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [structure, setStructure] = useState<AssessmentSchemeStructure | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await requestJson(
        `/api/teacher/courses/${courseId}/assessment-scheme`,
      )) as Workspace;
      setWorkspace(data);
      setStructure(data.draft?.structure ?? null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "加载失败。");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const perform = async (
    operation: () => Promise<unknown>,
    success: string,
  ) => {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
      setMessage(success);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6">正在加载考核方案…</div>
    );
  }
  if (!workspace) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <p>{error ?? "无法读取考核方案。"}</p>
        <button
          className="mt-3 rounded-md border px-3 py-2"
          onClick={() => void load()}
        >
          重新加载
        </button>
      </div>
    );
  }

  const latestReview = workspace.reviews[0] ?? null;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            刷新恢复
          </button>
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">正式方案状态</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {workspace.current
                ? `当前为版本 ${workspace.current.versionNumber}`
                : "尚未发布正式考核方案"}
            </p>
            {workspace.current?.isSourceOutdated ? (
              <p className="mt-2 text-sm text-amber-700">
                当前方案来源已过期，请从最新正式大纲重新生成草稿。
              </p>
            ) : null}
          </div>
          <button
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={submitting}
            onClick={() =>
              void perform(
                () =>
                  requestJson(
                    `/api/teacher/courses/${courseId}/assessment-scheme`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ force: Boolean(workspace.draft) }),
                    },
                  ),
                workspace.draft
                  ? "已从当前正式大纲重新生成草稿。"
                  : "草稿已生成。",
              )
            }
          >
            {workspace.draft ? "从正式大纲重新生成" : "生成考核方案草稿"}
          </button>
        </div>
      </section>

      {structure && workspace.draft ? (
        <section className="space-y-5 rounded-xl border bg-white p-5">
          <div>
            <h2 className="font-semibold">
              审核草稿 · 修订 {workspace.draft.revisionNumber}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              大纲来源页码不可改写；满分、成绩来源和缺失比例需确认后才能发布。
            </p>
          </div>

          {structure.warnings.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {structure.warnings.map((warning) => (
                <p key={warning}>• {warning}</p>
              ))}
            </div>
          ) : null}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">课程目标与达成阈值</h3>
            {structure.outcomes.map((outcome, outcomeIndex) => (
              <div
                className="grid gap-3 rounded-lg border p-4 md:grid-cols-[100px_1fr_180px]"
                key={outcome.code}
              >
                <div className="font-mono text-sm">{outcome.code}</div>
                <div>
                  <p className="font-medium">{outcome.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {outcome.description}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    来源页：
                    {outcome.sourceRefs.map((ref) => ref.page).join("、") ||
                      "教师补充"}
                  </p>
                </div>
                <label className="text-sm">
                  达成阈值（百分制）
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    inputMode="decimal"
                    value={outcome.attainmentThreshold ?? ""}
                    onChange={(event) => {
                      const next = structuredClone(structure);
                      next.outcomes[outcomeIndex]!.attainmentThreshold =
                        numberOrNull(event.target.value);
                      setStructure(next);
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">考核项目</h3>
            {structure.components.map((component, componentIndex) => (
              <div
                className="space-y-4 rounded-lg border p-4"
                key={component.code}
              >
                <div className="grid gap-3 md:grid-cols-4">
                  <label className="text-sm md:col-span-2">
                    项目名称
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      value={component.name}
                      onChange={(event) => {
                        const next = structuredClone(structure);
                        next.components[componentIndex]!.name =
                          event.target.value;
                        setStructure(next);
                      }}
                    />
                  </label>
                  <label className="text-sm">
                    满分
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      inputMode="decimal"
                      value={component.fullScore ?? ""}
                      onChange={(event) => {
                        const next = structuredClone(structure);
                        next.components[componentIndex]!.fullScore =
                          numberOrNull(event.target.value);
                        setStructure(next);
                      }}
                    />
                  </label>
                  <label className="text-sm">
                    总评权重（%）
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      inputMode="decimal"
                      value={component.weight ?? ""}
                      onChange={(event) => {
                        const next = structuredClone(structure);
                        next.components[componentIndex]!.weight = numberOrNull(
                          event.target.value,
                        );
                        setStructure(next);
                      }}
                    />
                  </label>
                  <label className="text-sm md:col-span-2">
                    成绩来源
                    <select
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      value={component.sourceType ?? ""}
                      onChange={(event) => {
                        const next = structuredClone(structure);
                        next.components[componentIndex]!.sourceType = (event
                          .target.value || null) as typeof component.sourceType;
                        setStructure(next);
                      }}
                    >
                      <option value="">请选择</option>
                      {SOURCE_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={component.enabled}
                      type="checkbox"
                      onChange={(event) => {
                        const next = structuredClone(structure);
                        next.components[componentIndex]!.enabled =
                          event.target.checked;
                        setStructure(next);
                      }}
                    />
                    启用此项目
                  </label>
                  <p className="text-muted-foreground self-end text-xs">
                    大纲来源页：
                    {component.sourceRefs.map((ref) => ref.page).join("、") ||
                      "无"}
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {component.mappings.map((mapping, mappingIndex) => {
                    const outcome = structure.outcomes.find(
                      (item) => item.code === mapping.objectiveCode,
                    );
                    return (
                      <label className="text-sm" key={mapping.objectiveCode}>
                        {outcome?.title ?? mapping.objectiveCode} 分配比例（%）
                        <input
                          className="mt-1 w-full rounded-md border px-3 py-2"
                          inputMode="decimal"
                          value={mapping.allocationRate ?? ""}
                          onChange={(event) => {
                            const next = structuredClone(structure);
                            next.components[componentIndex]!.mappings[
                              mappingIndex
                            ]!.allocationRate = numberOrNull(
                              event.target.value,
                            );
                            setStructure(next);
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={submitting}
              onClick={() =>
                void perform(
                  () =>
                    requestJson(
                      `/api/teacher/courses/${courseId}/assessment-scheme`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          expectedRevisionNumber:
                            workspace.draft!.revisionNumber,
                          structure,
                        }),
                      },
                    ),
                  "考核方案审核修订已保存。",
                )
              }
            >
              保存审核修订
            </button>
            <button
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={submitting || !latestReview}
              onClick={() => {
                if (!latestReview) return;
                void perform(
                  () =>
                    requestJson(
                      `/api/teacher/courses/${courseId}/assessment-scheme/publish`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          reviewRevisionId: latestReview.id,
                        }),
                      },
                    ),
                  "正式考核方案已发布。",
                );
              }}
            >
              发布最新审核修订
            </button>
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-gray-500">
          尚无考核方案草稿，请先从正式教学大纲生成。
        </div>
      )}

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">正式版本历史</h2>
        {workspace.history.length ? (
          <div className="mt-3 divide-y text-sm">
            {workspace.history.map((item) => (
              <div
                className="flex flex-wrap justify-between gap-2 py-3"
                key={item.id}
              >
                <span>版本 {item.versionNumber}</span>
                <span
                  className={
                    item.isSourceOutdated
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }
                >
                  {item.isSourceOutdated ? "来源已过期" : "来源为当前正式大纲"}
                </span>
                <span className="text-muted-foreground">
                  {new Date(item.publishedAt).toLocaleString("zh-CN")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">暂无正式版本。</p>
        )}
      </section>
    </div>
  );
}
