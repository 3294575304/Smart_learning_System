"use client";

import { useState } from "react";
import { requestApi } from "@/components/courses/request-api";

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
  historyOnly = false,
}: {
  courseId: string;
  classroomId: string;
  initialReflections: Reflection[];
  historyOnly?: boolean;
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
    if (pending) return;
    setPending(true);
    setError(null);
    const response = await requestApi<Reflection>(
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
    setPending(false);
    if (response.success)
      setRecords((current) =>
        current.map((item) => (item.id === record.id ? response.data : item)),
      );
    else setError(response.error);
  }
  async function remove(id: string) {
    if (pending || !window.confirm("确定删除这份学习反思吗？")) return;
    setPending(true);
    setError(null);
    const response = await requestApi<{ deleted: boolean }>(
      `/api/student/courses/${encodeURIComponent(courseId)}/self-reflections/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    setPending(false);
    if (response.success)
      setRecords((current) => current.filter((item) => item.id !== id));
    else setError(response.error);
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
        <h2 className="font-semibold">
          {historyOnly ? "我的学习反思记录" : "AI 对话式自我反思"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          自述与客观掌握度分开保存；你可以修改、确认或删除，系统不会用它覆盖客观证据。
        </p>
      </div>
      {!historyOnly ? (
        <>
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
        </>
      ) : null}
      {historyOnly && error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {historyOnly && !records.length ? (
        <p className="text-sm text-slate-500">还没有保存的学习反思。</p>
      ) : null}
      <div className="space-y-3">
        {records.map((record) => (
          <article className="rounded-md border p-4 text-sm" key={record.id}>
            <div className="flex justify-between gap-3">
              <span className="font-medium">
                {record.status === "CONFIRMED" ? "已确认" : "待确认草稿"}
                {record.fallbackUsed ? " · 规则降级" : " · AI 整理"}
              </span>
              <button
                disabled={pending}
                className="text-red-700 disabled:opacity-50"
                onClick={() => void remove(record.id)}
                type="button"
              >
                删除
              </button>
            </div>
            <textarea
              className="mt-3 min-h-20 w-full rounded-md border p-2"
              disabled={pending}
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
              {isPracticeRequest(record.practiceRequest)
                ? `${record.practiceRequest.conceptIds.length} 个知识点 · ${record.practiceRequest.count} 题 · 难度 ${record.practiceRequest.difficulty}`
                : "未设置定向练习条件"}
            </p>
            {record.status !== "CONFIRMED" || historyOnly ? (
              <button
                disabled={pending}
                className="mt-3 rounded-md bg-sky-600 px-3 py-2 text-xs text-white"
                onClick={() => void confirm(record)}
                type="button"
              >
                {record.status === "CONFIRMED" ? "保存修改" : "确认这份自述"}
              </button>
            ) : null}
            {!historyOnly &&
            record.status === "CONFIRMED" &&
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
