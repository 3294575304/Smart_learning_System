"use client";

import { useState } from "react";

interface Reflection {
  id: string;
  inputText: string;
  summary: string;
  goals: string[];
  difficulties: string[];
  learningHabits: string[];
  practiceRequest: unknown;
  status: string;
  fallbackUsed: boolean;
}

function isPracticeRequest(value: unknown): value is {
  conceptIds: string[];
  questionTypes: string[];
  count: number;
  difficulty: number;
} {
  if (!value || typeof value !== "object") return false;
  return (
    Array.isArray(Reflect.get(value, "conceptIds")) &&
    Array.isArray(Reflect.get(value, "questionTypes"))
  );
}

export function SelfReflectionPanel({
  courseId,
  classroomId,
  initialReflections,
}: {
  courseId: string;
  classroomId: string;
  initialReflections: Reflection[];
}) {
  const [text, setText] = useState("");
  const [records, setRecords] = useState(initialReflections);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    setPending(true);
    setError(null);
    const response = await fetch(
      `/api/student/courses/${encodeURIComponent(courseId)}/self-reflections`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );
    const body = await response.json();
    setPending(false);
    if (!response.ok || !body.success)
      return setError(body.error ?? "生成失败");
    setRecords([body.data, ...records]);
    setText("");
  }
  async function confirm(record: Reflection) {
    const response = await fetch(
      `/api/student/courses/${encodeURIComponent(courseId)}/self-reflections/${encodeURIComponent(record.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          summary: record.summary,
          goals: record.goals,
          difficulties: record.difficulties,
          learningHabits: record.learningHabits,
          practiceRequest: record.practiceRequest,
          status: "CONFIRMED",
        }),
      },
    );
    const body = await response.json();
    if (response.ok && body.success)
      setRecords(
        records.map((item) => (item.id === record.id ? body.data : item)),
      );
    else setError(body.error ?? "确认失败");
  }
  async function remove(id: string) {
    const response = await fetch(
      `/api/student/courses/${encodeURIComponent(courseId)}/self-reflections/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (response.ok) setRecords(records.filter((item) => item.id !== id));
    else setError("删除失败");
  }
  async function startPractice(record: Reflection) {
    if (!isPracticeRequest(record.practiceRequest)) return;
    setPending(true);
    const response = await fetch(
      `/api/student/courses/${encodeURIComponent(courseId)}/recommendations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classroomId, ...record.practiceRequest }),
      },
    );
    const body = await response.json();
    setPending(false);
    if (!response.ok || !body.success)
      return setError(body.error ?? "生成练习失败");
    window.location.reload();
  }
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5">
      <div>
        <h2 className="font-semibold">AI 对话式自我反思</h2>
        <p className="mt-1 text-sm text-gray-500">
          自述与客观掌握度分开保存；你可以修改、确认或删除，系统不会用它覆盖客观证据。
        </p>
      </div>
      <textarea
        className="min-h-28 w-full rounded-md border p-3 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例如：我想复习循环结构，先做 5 道基础题；嵌套循环总容易写错。"
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
        disabled={pending || text.trim().length < 2}
        onClick={() => void create()}
        type="button"
      >
        {pending ? "正在整理…" : "生成结构化草稿"}
      </button>
      <div className="space-y-3">
        {records.map((record) => (
          <article className="rounded-md border p-4 text-sm" key={record.id}>
            <div className="flex justify-between gap-3">
              <span className="font-medium">
                {record.status === "CONFIRMED" ? "已确认" : "待确认草稿"}
                {record.fallbackUsed ? " · 规则降级" : " · AI 整理"}
              </span>
              <button
                className="text-red-700"
                onClick={() => void remove(record.id)}
                type="button"
              >
                删除
              </button>
            </div>
            <textarea
              className="mt-3 min-h-20 w-full rounded-md border p-2"
              value={record.summary}
              onChange={(e) =>
                setRecords(
                  records.map((item) =>
                    item.id === record.id
                      ? { ...item, summary: e.target.value }
                      : item,
                  ),
                )
              }
            />
            <p className="mt-2 text-xs text-gray-500">
              练习条件：
              {record.practiceRequest
                ? JSON.stringify(record.practiceRequest)
                : "未识别到明确请求"}
            </p>
            {record.status !== "CONFIRMED" ? (
              <button
                className="mt-3 rounded-md bg-black px-3 py-2 text-xs text-white"
                onClick={() => void confirm(record)}
                type="button"
              >
                确认这份自述
              </button>
            ) : null}
            {record.status === "CONFIRMED" &&
            isPracticeRequest(record.practiceRequest) ? (
              <button
                className="mt-3 ml-2 rounded-md border px-3 py-2 text-xs"
                onClick={() => void startPractice(record)}
                type="button"
              >
                按此条件发起练习
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
