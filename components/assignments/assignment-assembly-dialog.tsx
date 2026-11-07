"use client";

import { useRef, useState } from "react";
import type { QuestionType } from "@prisma/client";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { AssignmentAssemblyReview } from "@/services/assignments/editor-assistance-schemas";
import { EditorDialog } from "./editor-dialog";
import { requestAssignmentApi } from "./request-api";

export interface AssemblyChapter {
  id: string;
  name: string;
  nodes: Array<{ conceptId: string; name: string }>;
}

export function AssignmentAssemblyDialog({
  chapters,
  classroomIds,
  excludedIds,
  questionContents,
  onAdd,
  onClose,
}: {
  chapters: AssemblyChapter[];
  classroomIds: string[];
  excludedIds: string[];
  questionContents: ReadonlyMap<string, string | undefined>;
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [conceptIds, setConceptIds] = useState<string[]>([]);
  const [types, setTypes] = useState<QuestionType[]>([]);
  const [difficulty, setDifficulty] = useState("");
  const [count, setCount] = useState("10");
  const [result, setResult] = useState<AssignmentAssemblyReview | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const roomLimit = Math.min(30, 200 - excludedIds.length);
  function toggleConcepts(ids: string[], on: boolean) {
    setConceptIds((current) =>
      on
        ? [...new Set([...current, ...ids])]
        : current.filter((id) => !ids.includes(id)),
    );
  }
  async function generate() {
    if (inFlight.current) return;
    const requested = Number(count);
    if (!conceptIds.length || conceptIds.length > 200) {
      setError("请选择 1 至 200 个知识点");
      return;
    }
    if (
      !Number.isInteger(requested) ||
      requested < 1 ||
      requested > roomLimit
    ) {
      setError(`本次可建议 1 至 ${roomLimit} 道题`);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const response = await requestAssignmentApi<AssignmentAssemblyReview>(
      "/api/teacher/assignments/editor-assistance",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "ASSEMBLE",
          classroomIds,
          excludedIds,
          conceptIds,
          types,
          count: requested,
          difficulty: difficulty ? Number(difficulty) : undefined,
        }),
      },
    );
    if (response.success) {
      setResult(response.data);
      setChecked(response.data.questions.map((q) => q.id));
    } else setError(response.error);
    setBusy(false);
    inFlight.current = false;
  }

  function renderReviewQuestion(
    q: AssignmentAssemblyReview["questions"][number],
  ) {
    const content = questionContents.get(q.id);
    return (
      <li key={q.id} className="p-3">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={checked.includes(q.id)}
            disabled={!checked.includes(q.id) && checked.length >= roomLimit}
            className="mt-1 shrink-0"
            onChange={(e) =>
              setChecked(
                e.target.checked
                  ? [...checked, q.id]
                  : checked.filter((id) => id !== q.id),
              )
            }
          />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="block font-medium">{q.title}</span>
            <span className="block text-xs text-slate-600">
              {QUESTION_TYPE_LABELS[q.type]} · 难度 {q.difficulty} ·{" "}
              {q.conceptNames.join("、")}
            </span>
            <span className="block text-xs text-slate-700">{q.reason}</span>
            <span className="mt-1 block text-xs text-sky-800">
              {q.recentClassrooms.length
                ? `近期用过 · ${q.recentClassrooms.join("、")}`
                : q.lastUsedAt
                  ? `历史用过 · ${new Date(q.lastUsedAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}`
                  : "暂无使用记录"}
            </span>
          </span>
        </label>
        {content && (
          <details className="ms-5 mt-2 text-xs">
            <summary className="cursor-pointer text-sky-800">查看题干</summary>
            <p className="mt-1 [overflow-wrap:anywhere] whitespace-pre-wrap">
              {content}
            </p>
          </details>
        )}
      </li>
    );
  }

  return (
    <EditorDialog open busy={busy} title="智能组卷" onClose={onClose}>
      <div className="mt-4 space-y-4 text-sm">
        <p className="text-slate-600">
          按当前课程的正式知识点从题库组卷。本班 90
          天内用过的题会优先避开，可在审核时保留经典题。
        </p>
        {!result ? (
          <fieldset disabled={busy} className="space-y-3">
            <legend className="sr-only">组卷条件</legend>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2">
                题量
                <input
                  type="number"
                  min="1"
                  max={roomLimit}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="h-10 w-20 rounded-lg border px-2"
                />
              </label>
              <label className="flex items-center gap-2">
                难度
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="h-10 rounded-lg border px-2"
                >
                  <option value="">全部难度</option>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value} 级
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="flex flex-wrap gap-x-3 gap-y-2">
              <legend className="mb-2 font-medium">题型（可多选）</legend>
              {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                <label
                  key={value}
                  className="inline-flex items-center gap-1.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={types.includes(value as QuestionType)}
                    onChange={(e) => {
                      const type = value as QuestionType;
                      setTypes(
                        e.target.checked
                          ? [...types, type]
                          : types.filter((item) => item !== type),
                      );
                    }}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <fieldset className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
              <legend className="px-1 font-medium">
                章节与知识点（已选 {conceptIds.length}）
              </legend>
              {chapters.map((chapter) => (
                <details
                  key={chapter.id}
                  className="rounded-lg bg-slate-50 px-3 py-2"
                >
                  <summary className="cursor-pointer [overflow-wrap:anywhere]">
                    {chapter.name} ·{" "}
                    {
                      chapter.nodes.filter((point) =>
                        conceptIds.includes(point.conceptId),
                      ).length
                    }
                    /{chapter.nodes.length}
                  </summary>
                  <div className="mt-2 grid gap-1.5">
                    <label className="inline-flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={chapter.nodes.every((point) =>
                          conceptIds.includes(point.conceptId),
                        )}
                        onChange={(e) =>
                          toggleConcepts(
                            chapter.nodes.map((point) => point.conceptId),
                            e.target.checked,
                          )
                        }
                      />
                      选择整章
                    </label>
                    {chapter.nodes.map((point) => (
                      <label
                        key={point.conceptId}
                        className="ms-3 flex items-start gap-2 [overflow-wrap:anywhere]"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          checked={conceptIds.includes(point.conceptId)}
                          onChange={(e) =>
                            toggleConcepts([point.conceptId], e.target.checked)
                          }
                        />
                        <span className="min-w-0">{point.name}</span>
                      </label>
                    ))}
                  </div>
                </details>
              ))}
            </fieldset>
          </fieldset>
        ) : (
          <div className="space-y-3">
            <p role="status" className="rounded-lg bg-sky-50 p-3 text-sky-900">
              {result.source === "AI" ? "AI 组卷建议" : "规则组卷建议"} · 已找到{" "}
              {result.questions.length} / {result.requested} 题
              {result.missingConceptNames.length
                ? `。建议卷未覆盖：${result.missingConceptNames.join("、")}`
                : "。"}
            </p>
            <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
              {result.questions.map(renderReviewQuestion)}
            </ul>
            {result.alternatives.length > 0 && (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer font-medium">
                  备选题（{result.alternatives.length} 道，可替换或补选）
                </summary>
                <ul className="mt-2 max-h-64 divide-y overflow-y-auto">
                  {result.alternatives.map(renderReviewQuestion)}
                </ul>
              </details>
            )}
            <p className="text-xs text-slate-600">
              取消勾选可移除建议题，勾选备选题可替换或补充。加入后仍可在题库中调整。
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-rose-800">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-10 rounded-lg border px-4 disabled:opacity-50"
          >
            取消
          </button>
          {result ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
                className="h-10 rounded-lg border px-4 text-sky-800"
              >
                调整条件
              </button>
              <button
                type="button"
                disabled={!checked.length}
                onClick={() =>
                  onAdd(
                    [...result.questions, ...result.alternatives]
                      .map((q) => q.id)
                      .filter((id) => checked.includes(id)),
                  )
                }
                className="h-10 rounded-lg bg-sky-700 px-4 text-white disabled:opacity-50"
              >
                确认加入 {checked.length} 题
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void generate()}
              className="h-10 rounded-lg bg-sky-700 px-4 text-white disabled:opacity-50"
            >
              {busy ? "正在组卷…" : "生成组卷建议"}
            </button>
          )}
        </div>
      </div>
    </EditorDialog>
  );
}
