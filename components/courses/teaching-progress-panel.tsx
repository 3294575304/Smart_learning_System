"use client";

import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import Link from "next/link";
import { useState } from "react";

interface Props {
  courseId: string;
  data: {
    classroomId?: string | null;
    inherited?: boolean;
    classrooms?: Array<{ id: string; name: string }>;
    chapters?: Array<{
      id: string;
      name: string;
      code: string;
      nodes: Array<{
        id: string;
        conceptId: string;
        code: string;
        name: string;
      }>;
    }>;
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
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [chapterId, setChapterId] = useState(data.chapters?.[0]?.id ?? "");
  const chapters = data.chapters ?? [
    {
      id: "all",
      name: "全部知识点",
      code: "",
      nodes: data.nodes.filter((node) => node.nodeType === "KNOWLEDGE_POINT"),
    },
  ];
  const chapter = chapters.find((item) => item.id === chapterId) ?? chapters[0];
  const points = data.nodes.filter(
    (node) => node.nodeType === "KNOWLEDGE_POINT",
  );
  const visible = (chapter?.nodes ?? []).filter(
    (node) =>
      `${node.name} ${node.code}`
        .toLowerCase()
        .includes(keyword.toLowerCase()) &&
      (status === "all" ||
        (status === "taught") === conceptIds.includes(node.conceptId)),
  );
  function batch(ids: string[], checked: boolean) {
    setConceptIds((current) =>
      checked
        ? [...new Set([...current, ...ids])]
        : current.filter((id) => !ids.includes(id)),
    );
  }
  const [note, setNote] = useState(data.revision?.note ?? "");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [policyValues, setPolicyValues] = useState(policy);
  async function save() {
    if (!data.graphVersion) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/teacher/courses/${encodeURIComponent(courseId)}/teaching-progress`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            graphVersionId: data.graphVersion.id,
            classroomId: data.classroomId ?? undefined,
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
    } catch {
      setFeedback("网络连接异常，请重试，当前选择已保留。");
    } finally {
      setPending(false);
    }
  }
  async function savePolicy() {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/teacher/courses/${encodeURIComponent(courseId)}/recommendation-policy`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedRevision: policy.revisionNumber,
            weaknessWeight: policyValues.weaknessWeight,
            prerequisiteWeight: policyValues.prerequisiteWeight,
            difficultyWeight: policyValues.difficultyWeight,
            errorPatternWeight: policyValues.errorPatternWeight,
            freshnessWeight: policyValues.freshnessWeight,
            teacherPriorityWeight: policyValues.teacherPriorityWeight,
            recentWindowDays: policyValues.recentWindowDays,
            difficultyTolerance: policyValues.difficultyTolerance,
            maxQuestionCount: policyValues.maxQuestionCount,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok || !body.success) {
        setFeedback(body.error ?? "保存失败");
        return;
      }
      window.location.reload();
    } catch {
      setFeedback("网络连接异常，请重试，当前设置已保留。");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-white">
        <header className="border-b bg-sky-50/60 p-6">
          <TeacherBackLink href={`/teacher/courses/${courseId}`}>
            返回课程
          </TeacherBackLink>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">教学进度</h1>
              <p className="mt-2 text-sm text-slate-600">
                按章节记录已授内容，学生练习将遵循所选班级的进度。
              </p>
            </div>
            <span className="rounded-xl bg-white px-5 py-3 text-sm">
              已授{" "}
              <strong className="text-xl text-sky-700">
                {
                  conceptIds.filter((id) =>
                    points.some((node) => node.conceptId === id),
                  ).length
                }
              </strong>{" "}
              / {points.length} 个知识点
            </span>
          </div>
          <nav className="mt-5 flex flex-wrap gap-2" aria-label="班级教学进度">
            <Link
              className={`rounded-lg border px-3 py-2 text-sm ${!data.classroomId ? "bg-sky-700 text-white" : "bg-white"}`}
              href={`/teacher/courses/${courseId}/teaching-progress`}
            >
              课程默认进度
            </Link>
            {data.classrooms?.map((item) => (
              <Link
                key={item.id}
                className={`rounded-lg border px-3 py-2 text-sm ${data.classroomId === item.id ? "bg-sky-700 text-white" : "bg-white"}`}
                href={`/teacher/courses/${courseId}/teaching-progress?classroomId=${item.id}`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
          <p className="mt-3 text-xs text-slate-500">
            {data.classroomId
              ? data.inherited
                ? "该班级尚未单独设置，当前继承课程默认进度；保存后仅影响本班。"
                : "当前编辑所选班级的独立进度。"
              : "课程默认进度供尚未单独设置进度的班级使用。"}
          </p>
        </header>
        {!data.graphVersion ? (
          <p className="m-6 rounded-lg bg-amber-50 p-4 text-amber-800">
            请先发布正式知识图谱。
          </p>
        ) : (
          <>
            <div className="grid md:grid-cols-[260px_minmax(0,1fr)]">
              <aside
                className="max-h-[36rem] space-y-2 overflow-auto border-b bg-slate-50 p-4 md:border-r md:border-b-0"
                aria-label="章节"
              >
                {chapters.map((item) => {
                  const taught = item.nodes.filter((node) =>
                    conceptIds.includes(node.conceptId),
                  ).length;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setChapterId(item.id)}
                      className={`w-full rounded-xl border p-3 text-left ${chapter?.id === item.id ? "border-sky-500 bg-white shadow-sm" : "border-transparent"}`}
                    >
                      <span className="block text-sm font-medium">
                        {item.name}
                      </span>
                      <span className="mt-2 block text-xs text-slate-500">
                        已授 {taught} / {item.nodes.length}
                      </span>
                      <span className="mt-2 block h-1.5 overflow-hidden rounded bg-slate-200">
                        <span
                          className="block h-full rounded bg-sky-500"
                          style={{
                            width: `${item.nodes.length ? (taught / item.nodes.length) * 100 : 0}%`,
                          }}
                        />
                      </span>
                    </button>
                  );
                })}
              </aside>
              <div className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">
                    {chapter?.name ?? "暂无知识点"}
                  </h2>
                  <div className="flex gap-3 text-sm">
                    <button
                      type="button"
                      disabled={pending}
                      className="text-sky-700"
                      onClick={() =>
                        batch(
                          visible.map((node) => node.conceptId),
                          true,
                        )
                      }
                    >
                      将筛选结果标为已授
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className="text-slate-600"
                      onClick={() =>
                        batch(
                          visible.map((node) => node.conceptId),
                          false,
                        )
                      }
                    >
                      标为未授
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <input
                    aria-label="搜索知识点"
                    placeholder="搜索知识点名称或编号"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border p-2.5 text-sm"
                  />
                  <select
                    aria-label="进度筛选"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="rounded-lg border p-2 text-sm"
                  >
                    <option value="all">全部状态</option>
                    <option value="taught">已授</option>
                    <option value="untaught">未授</option>
                  </select>
                </div>
                <div className="mt-4 max-h-[28rem] divide-y overflow-auto rounded-xl border">
                  {visible.map((node) => (
                    <label
                      key={node.id}
                      className="flex cursor-pointer items-center gap-3 p-3 hover:bg-sky-50"
                    >
                      <input
                        type="checkbox"
                        disabled={pending}
                        checked={conceptIds.includes(node.conceptId)}
                        onChange={(e) =>
                          batch([node.conceptId], e.target.checked)
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {node.name}
                        </span>
                        <span className="text-xs text-slate-500">
                          {node.code}
                        </span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${conceptIds.includes(node.conceptId) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {conceptIds.includes(node.conceptId) ? "已授" : "未授"}
                      </span>
                    </label>
                  ))}
                  {!visible.length && (
                    <p className="p-10 text-center text-sm text-slate-500">
                      没有符合条件的知识点，请调整搜索或状态筛选。
                    </p>
                  )}
                </div>
              </div>
            </div>
            <footer className="border-t bg-slate-50 p-5">
              <label className="block text-sm">
                进度备注
                <textarea
                  className="mt-2 min-h-20 w-full rounded-lg border bg-white p-3"
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例如：完成第二章，下一次讲解循环结构"
                />
              </label>
              {feedback && (
                <p role="alert" className="mt-3 text-sm text-red-700">
                  {feedback}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  保存后保留历史版本；课程图谱更新时请重新确认进度。
                </span>
                <button
                  className="shrink-0 rounded-lg bg-sky-700 px-5 py-2.5 text-sm text-white disabled:opacity-50"
                  disabled={pending}
                  onClick={() => void save()}
                  type="button"
                >
                  {pending ? "保存中…" : "保存教学进度"}
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
      <details className="rounded-xl border bg-white p-5">
        <summary className="cursor-pointer font-semibold">
          高级设置 · 课程推荐策略
        </summary>
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
      </details>
    </div>
  );
}
