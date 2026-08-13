"use client";

import { useState } from "react";

interface Props {
  courseId: string;
  data: {
    graphVersion: { id: string; versionNumber: number } | null;
    revision: {
      revisionNumber: number;
      note: string | null;
      concepts: Array<{ conceptId: string }>;
    } | null;
    nodes: Array<{
      id: string;
      conceptId: string;
      code: string;
      name: string;
      nodeType: string;
    }>;
  };
  policy: {
    revisionNumber: number;
    weaknessWeight: number;
    prerequisiteWeight: number;
    difficultyWeight: number;
    errorPatternWeight: number;
    freshnessWeight: number;
    teacherPriorityWeight: number;
    recentWindowDays: number;
    difficultyTolerance: number;
    maxQuestionCount: number;
  };
}

export function TeachingProgressPanel({ courseId, data, policy }: Props) {
  const [conceptIds, setConceptIds] = useState(
    data.revision?.concepts.map((item) => item.conceptId) ?? [],
  );
  const [note, setNote] = useState(data.revision?.note ?? "");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [policyValues, setPolicyValues] = useState(policy);
  async function save() {
    if (!data.graphVersion) return;
    setPending(true);
    setFeedback(null);
    const response = await fetch(
      `/api/teacher/courses/${encodeURIComponent(courseId)}/teaching-progress`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          graphVersionId: data.graphVersion.id,
          expectedRevision: data.revision?.revisionNumber ?? 0,
          conceptIds,
          note,
        }),
      },
    );
    const body = await response.json();
    setPending(false);
    if (!response.ok || !body.success)
      return setFeedback(body.error ?? "保存失败");
    window.location.reload();
  }
  async function savePolicy() {
    setPending(true);
    setFeedback(null);
    const response = await fetch(
      `/api/teacher/courses/${encodeURIComponent(courseId)}/recommendation-policy`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: policy.revisionNumber,
          ...policyValues,
          revisionNumber: undefined,
        }),
      },
    );
    const body = await response.json();
    setPending(false);
    if (!response.ok || !body.success)
      return setFeedback(body.error ?? "保存失败");
    window.location.reload();
  }
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5">
        <h1 className="text-xl font-semibold">教学进度</h1>
        <p className="mt-2 text-sm text-gray-500">
          显式确认当前正式图谱中已授知识点。推荐只会使用此范围，保存采用乐观并发并生成不可变修订。
        </p>
        {!data.graphVersion ? (
          <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            请先发布正式知识图谱。
          </p>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              {data.nodes
                .filter((node) => node.nodeType === "KNOWLEDGE_POINT")
                .map((node) => (
                  <label
                    className="rounded-full border px-3 py-2 text-xs"
                    key={node.id}
                  >
                    <input
                      className="mr-2"
                      type="checkbox"
                      checked={conceptIds.includes(node.conceptId)}
                      onChange={(e) =>
                        setConceptIds(
                          e.target.checked
                            ? [...conceptIds, node.conceptId]
                            : conceptIds.filter((id) => id !== node.conceptId),
                        )
                      }
                    />
                    {node.code} {node.name}
                  </label>
                ))}
            </div>
            <label className="mt-4 block text-sm">
              备注
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border p-2"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {feedback ? (
              <p className="mt-3 text-sm text-red-700">{feedback}</p>
            ) : null}
            <button
              className="mt-4 rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
              disabled={pending || !conceptIds.length}
              onClick={() => void save()}
              type="button"
            >
              {pending
                ? "保存中…"
                : `保存修订 ${data.revision ? data.revision.revisionNumber + 1 : 1}`}
            </button>
          </>
        )}
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">推荐策略</h2>
        <p className="mt-1 text-sm text-gray-500">
          六项权重合计必须为 100%，保存后生成不可变策略修订。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            [
              ["weaknessWeight", "掌握缺口"],
              ["prerequisiteWeight", "先修缺口"],
              ["difficultyWeight", "难度适配"],
              ["errorPatternWeight", "近期错误"],
              ["freshnessWeight", "题目新鲜度"],
              ["teacherPriorityWeight", "教师重点"],
            ] as const
          ).map(([key, label]) => (
            <label className="text-sm" key={key}>
              {label}
              <input
                className="mt-1 w-full rounded-md border p-2"
                min={0}
                max={100}
                type="number"
                value={policyValues[key]}
                onChange={(event) =>
                  setPolicyValues({
                    ...policyValues,
                    [key]: Number(event.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm">
          当前合计：
          {policyValues.weaknessWeight +
            policyValues.prerequisiteWeight +
            policyValues.difficultyWeight +
            policyValues.errorPatternWeight +
            policyValues.freshnessWeight +
            policyValues.teacherPriorityWeight}
          %
        </p>
        <button
          className="mt-4 rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          disabled={pending}
          onClick={() => void savePolicy()}
          type="button"
        >
          保存推荐策略
        </button>
      </section>
    </div>
  );
}
