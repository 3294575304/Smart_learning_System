"use client";

import { useState } from "react";

import { requestApi } from "@/components/courses/request-api";

interface Category {
  id: string;
  name: string;
  isActive: boolean;
  _count: { courses: number; questions: number };
}

interface Props {
  initialCategories: Category[];
}

export function QuestionCourseCategoryManager({ initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const result = editingId
      ? await requestApi<Category>(
          `/api/admin/question-course-categories/${editingId}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name }),
          },
        )
      : await requestApi<Category>("/api/admin/question-course-categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setCategories((items) => {
      const next = items.filter((item) => item.id !== result.data.id);
      return [...next, result.data].sort((a, b) =>
        a.name.localeCompare(b.name, "zh-CN"),
      );
    });
    setName("");
    setEditingId(null);
    setNotice(editingId ? "课程分类已更新。" : "课程分类已创建。");
  }

  async function toggle(category: Category) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await requestApi<Category>(
      `/api/admin/question-course-categories/${category.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: category.name,
          isActive: !category.isActive,
        }),
      },
    );
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setCategories((items) =>
      items.map((item) => (item.id === result.data.id ? result.data : item)),
    );
    setNotice(category.isActive ? "课程分类已停用。" : "课程分类已启用。");
  }

  return (
    <div className="space-y-5 rounded-xl border bg-white p-5">
      <form className="flex flex-wrap gap-2" onSubmit={save}>
        <label className="min-w-64 flex-1 space-y-1">
          <span className="text-sm font-medium">课程分类名称</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <button
          className="mt-6 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={pending}
        >
          {pending ? "保存中…" : editingId ? "保存修改" : "添加分类"}
        </button>
        {editingId ? (
          <button
            className="mt-6 rounded-md border px-4 py-2 text-sm"
            disabled={pending}
            onClick={() => {
              setEditingId(null);
              setName("");
            }}
            type="button"
          >
            取消
          </button>
        ) : null}
      </form>
      {error ? (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      ) : null}
      {categories.length ? (
        <ul className="divide-y">
          {categories.map((category) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 py-3"
              key={category.id}
            >
              <div>
                <p className="font-medium">
                  {category.name}
                  {!category.isActive ? "（已停用）" : ""}
                </p>
                <p className="text-xs text-slate-500">
                  {category._count.courses} 条开课 · {category._count.questions}{" "}
                  道题
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-md border px-3 py-1.5 text-sm"
                  disabled={pending}
                  onClick={() => {
                    setEditingId(category.id);
                    setName(category.name);
                    setError(null);
                  }}
                  type="button"
                >
                  改名
                </button>
                <button
                  className="rounded-md border px-3 py-1.5 text-sm"
                  disabled={pending}
                  onClick={() => void toggle(category)}
                  type="button"
                >
                  {category.isActive ? "停用" : "启用"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">暂无课程分类。</p>
      )}
    </div>
  );
}
