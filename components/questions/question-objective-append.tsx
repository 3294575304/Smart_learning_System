"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestQuestionApi } from "./request-api";

export function QuestionObjectiveAppend({
  courseId,
  scope,
  candidates,
}: {
  courseId: string;
  scope: {
    syllabusStructureId: string;
    objectives: Array<{ code: string; title: string }>;
  };
  candidates: Array<{ id: string; title: string; codes: string[] }>;
}) {
  const router = useRouter();
  const [objectiveCode, setObjectiveCode] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const available = candidates.filter(
    ({ codes }) => codes.length < 3 && !codes.includes(objectiveCode),
  );

  async function submit() {
    if (pending || !ids.length || !objectiveCode) return;
    setPending(true);
    setMessage("");
    setError("");
    const result = await requestQuestionApi<{
      added: number;
      unchanged: number;
      limitReached: number;
    }>("/api/teacher/questions/course-objective/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        courseId,
        syllabusStructureId: scope.syllabusStructureId,
        questionIds: ids,
        objectiveCode,
      }),
    });
    if (result.success) {
      const { added, unchanged, limitReached } = result.data;
      setMessage(
        `已追加 ${added} 道，已有该目标 ${unchanged} 道，已达上限 ${limitReached} 道。`,
      );
      setIds([]);
      router.refresh();
    } else {
      setError(result.error);
    }
    setPending(false);
  }

  return (
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer font-medium">批量追加课程目标</summary>
      <p className="mt-2 text-sm text-slate-600">
        每次最多选择本页 20 道题，原有标注保留，每题最多三个目标。
      </p>
      <label className="mt-3 block text-sm">
        追加目标
        <select
          className="mt-1 block w-full rounded-md border px-3 py-2 sm:w-auto"
          disabled={pending}
          value={objectiveCode}
          onChange={(event) => {
            setObjectiveCode(event.target.value);
            setIds([]);
            setMessage("");
            setError("");
          }}
        >
          <option value="">请选择课程目标</option>
          {scope.objectives.map(({ code, title }) => (
            <option key={code} value={code}>
              {code} · {title}
            </option>
          ))}
        </select>
      </label>
      {objectiveCode && available.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            className="rounded border px-2.5 py-1 text-sky-800 disabled:opacity-50"
            disabled={pending}
            onClick={() => setIds(available.slice(0, 20).map(({ id }) => id))}
          >
            {available.length > 20
              ? "选择前 20 道可追加题目"
              : "全选本页可追加题目"}
          </button>
          {ids.length > 0 && (
            <button
              type="button"
              className="rounded border px-2.5 py-1 text-slate-700 disabled:opacity-50"
              disabled={pending}
              onClick={() => setIds([])}
            >
              清除选择
            </button>
          )}
        </div>
      )}
      {objectiveCode && (
        <fieldset className="mt-3 grid gap-2 sm:grid-cols-2" disabled={pending}>
          <legend className="sr-only">选择需要追加目标的题目</legend>
          {candidates.map(({ id, title, codes }) => {
            const unavailable = codes.includes(objectiveCode)
              ? "已有该目标"
              : codes.length >= 3
                ? "已达上限"
                : "";
            return (
              <label
                key={id}
                className="flex items-start gap-2 rounded border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={ids.includes(id)}
                  disabled={
                    Boolean(unavailable) ||
                    (ids.length >= 20 && !ids.includes(id))
                  }
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setIds((current) =>
                      checked
                        ? [...current, id]
                        : current.filter((value) => value !== id),
                    );
                  }}
                />
                <span className="min-w-0 break-words">
                  {title}
                  <span className="block text-xs text-slate-600">
                    {codes.join("、") || "暂无标注"}
                    {unavailable && ` · ${unavailable}`}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      <button
        type="button"
        className="mt-3 rounded bg-sky-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        disabled={pending || !objectiveCode || !ids.length}
        onClick={() => void submit()}
      >
        {pending ? "正在追加…" : `确认追加到 ${ids.length} 道题`}
      </button>
      {message && (
        <p className="mt-2 text-sm" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
