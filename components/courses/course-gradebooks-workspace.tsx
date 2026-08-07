"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Classroom {
  id: string;
  name: string;
}

interface Gradebook {
  id: string;
  classroom: Classroom;
  scheme: { versionNumber: number };
  currentPublication: {
    versionNumber: number;
    publishedAt: string;
  } | null;
}

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  if (!response.ok || !payload.success) {
    throw new Error(payload.error ?? "请求失败。");
  }
  return payload.data;
}

export function CourseGradebooksWorkspace({ courseId }: { courseId: string }) {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [gradebooks, setGradebooks] = useState<Gradebook[]>([]);
  const [classroomId, setClassroomId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [course, list] = await Promise.all([
        json(`/api/teacher/courses/${courseId}`) as Promise<{
          linkedClassrooms: Classroom[];
        }>,
        json(`/api/teacher/courses/${courseId}/gradebooks`) as Promise<
          Gradebook[]
        >,
      ]);
      setClassrooms(course.linkedClassrooms);
      setGradebooks(list);
      setClassroomId(
        (current) => current || course.linkedClassrooms[0]?.id || "",
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "加载失败。");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!classroomId) return;
    setSubmitting(true);
    setError(null);
    try {
      await json(`/api/teacher/courses/${courseId}/gradebooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroomId }),
      });
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "创建失败。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="rounded-xl border bg-white p-6">正在加载成绩台账…</div>
    );
  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            重试
          </button>
        </div>
      ) : null}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">建立班级成绩台账</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          台账固定引用当前正式考核方案；方案升级后需要建立新台账以保留历史口径。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <select
            className="min-w-64 rounded-md border px-3 py-2 text-sm"
            value={classroomId}
            onChange={(event) => setClassroomId(event.target.value)}
          >
            <option value="">请选择关联班级</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
          <button
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!classroomId || submitting}
            onClick={() => void create()}
          >
            创建或打开台账
          </button>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">已有台账</h2>
        {gradebooks.length ? (
          <div className="mt-3 divide-y">
            {gradebooks.map((gradebook) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 py-4"
                key={gradebook.id}
              >
                <div>
                  <p className="font-medium">{gradebook.classroom.name}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    考核方案版本 {gradebook.scheme.versionNumber} ·{" "}
                    {gradebook.currentPublication
                      ? `正式成绩版本 ${gradebook.currentPublication.versionNumber}`
                      : "尚未发布成绩"}
                  </p>
                </div>
                <Link
                  className="rounded-md border px-4 py-2 text-sm"
                  href={`/teacher/courses/${courseId}/gradebook/${gradebook.id}`}
                >
                  打开台账
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">暂无成绩台账。</p>
        )}
      </section>
    </div>
  );
}
