"use client";

import { useState } from "react";

import { requestApi } from "@/components/courses/request-api";

export interface AdminCourseCategory {
  id: string;
  name: string;
  courseNo: string | null;
  isActive: boolean;
  _count: { courses: number; questions: number };
}

interface Props {
  categories: AdminCourseCategory[];
  onChange: (next: AdminCourseCategory[]) => void;
}

interface PendingCourseNoChange {
  categoryId: string;
  name: string;
  courseNo: string;
  courseCount: number;
}

function matchesQuery(category: AdminCourseCategory, query: string) {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return true;
  return (
    category.name
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .includes(normalized) ||
    (category.courseNo ?? "").toLocaleLowerCase("zh-CN").includes(normalized)
  );
}

export function QuestionCourseCategoryManager({ categories, onChange }: Props) {
  const [name, setName] = useState("");
  const [courseNo, setCourseNo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingCourseNoChange | null>(null);
  const [query, setQuery] = useState("");

  const visibleCategories = categories.filter((category) =>
    matchesQuery(category, query),
  );

  function resetForm() {
    setName("");
    setCourseNo("");
    setEditingId(null);
    setConfirm(null);
  }

  async function submitSave(payload: { name: string; courseNo: string }) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = editingId
      ? await requestApi<AdminCourseCategory>(
          `/api/admin/question-course-categories/${editingId}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        )
      : await requestApi<AdminCourseCategory>(
          "/api/admin/question-course-categories",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
    setPending(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const next = categories.filter((item) => item.id !== result.data.id);
    onChange(
      [...next, result.data].sort((a, b) =>
        a.name.localeCompare(b.name, "zh-CN"),
      ),
    );
    const wasEditing = editingId !== null;
    resetForm();
    setNotice(wasEditing ? "课程分类已更新。" : "课程分类已创建。");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedCourseNo = courseNo.trim().toUpperCase();
    if (!trimmedName || !trimmedCourseNo) {
      setError("请填写课程分类名称与课程号。");
      return;
    }
    if (editingId) {
      const original = categories.find((item) => item.id === editingId);
      if (
        original &&
        original.courseNo !== trimmedCourseNo &&
        original._count.courses > 0
      ) {
        setConfirm({
          categoryId: editingId,
          name: trimmedName,
          courseNo: trimmedCourseNo,
          courseCount: original._count.courses,
        });
        return;
      }
    }
    await submitSave({ name: trimmedName, courseNo: trimmedCourseNo });
  }

  async function toggle(category: AdminCourseCategory) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await requestApi<AdminCourseCategory>(
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
    onChange(
      categories.map((item) =>
        item.id === result.data.id ? result.data : item,
      ),
    );
    setNotice(category.isActive ? "课程分类已停用。" : "课程分类已启用。");
  }

  return (
    <div className="space-y-5 rounded-xl border bg-white p-5">
      <form className="flex flex-wrap gap-2" onSubmit={save}>
        <label className="min-w-60 flex-1 space-y-1">
          <span className="text-sm font-medium">课程分类名称</span>
          <input
            className="w-full rounded-md border px-3 py-2"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label className="min-w-40 flex-1 space-y-1">
          <span className="text-sm font-medium">课程号</span>
          <input
            className="w-full rounded-md border px-3 py-2 font-mono uppercase"
            maxLength={50}
            onChange={(event) => setCourseNo(event.target.value.toUpperCase())}
            placeholder="如 PYTHON-2026"
            required
            value={courseNo}
          />
        </label>
        <button
          className="mt-6 rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={pending}
        >
          {pending ? "保存中…" : editingId ? "保存修改" : "添加分类"}
        </button>
        {editingId ? (
          <button
            className="mt-6 rounded-md border px-4 py-2 text-sm"
            disabled={pending}
            onClick={resetForm}
            type="button"
          >
            取消
          </button>
        ) : null}
      </form>

      <p className="text-xs leading-5 text-slate-500">
        课程号需与教务课程目录一致，同一学校内不可重复；历史分类可先补全课程号再保存，不会影响已开课程。
      </p>

      {confirm ? (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">课程号变更将同步到已开课课程</p>
          <p className="leading-6">
            分类「{confirm.name}」下关联 {confirm.courseCount} 条开课记录，
            保存后未归档课程会统一改为课程号「{confirm.courseNo}
            」，已归档课程不受影响。
            若历史课程使用过多个不同课程号，这些课程号会被统一为一个；
            已导出或正在使用的成绩导入模板中的旧课程号会失效，需要重新下载。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={pending}
              onClick={() =>
                void submitSave({
                  name: confirm.name,
                  courseNo: confirm.courseNo,
                })
              }
              type="button"
            >
              确认同步并保存
            </button>
            <button
              className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm"
              disabled={pending}
              onClick={() => setConfirm(null)}
              type="button"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

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
        <div className="space-y-3">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">筛选</span>
            <input
              className="min-w-56 flex-1 rounded-md border px-3 py-2"
              maxLength={80}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="按课程分类名称或课程号筛选"
              value={query}
            />
            {query ? (
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setQuery("")}
                type="button"
              >
                清除
              </button>
            ) : null}
          </label>
          {visibleCategories.length ? (
            <ul className="divide-y">
              {visibleCategories.map((category) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={category.id}
                >
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span>
                        {category.name}
                        {!category.isActive ? "（已停用）" : ""}
                      </span>
                      {category.courseNo ? (
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                          {category.courseNo}
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          待补课程号
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {category._count.courses} 条开课 ·{" "}
                      {category._count.questions} 道题
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-md border px-3 py-1.5 text-sm"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(category.id);
                        setName(category.name);
                        setCourseNo(category.courseNo ?? "");
                        setConfirm(null);
                        setError(null);
                      }}
                      type="button"
                    >
                      编辑
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
            <p className="text-sm text-slate-500">没有匹配的课程分类。</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">暂无课程分类。</p>
      )}
    </div>
  );
}
