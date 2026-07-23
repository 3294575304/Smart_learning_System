"use client";

import { QuestionType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { QuestionListQuery } from "@/services/questions/schemas";
import type { KnowledgePointOption } from "@/services/questions/types";

interface QuestionFiltersProps {
  query: QuestionListQuery;
  knowledgePoints: KnowledgePointOption[];
}

export function QuestionFilters({
  query,
  knowledgePoints,
}: QuestionFiltersProps) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(query.keyword ?? "");

  function update(name: string, value: string) {
    const params = new URLSearchParams();
    params.set("scope", query.scope);
    params.set("pageSize", String(query.pageSize));
    if (query.keyword) params.set("keyword", query.keyword);
    if (query.type) params.set("type", query.type);
    if (query.difficulty) params.set("difficulty", String(query.difficulty));
    if (query.knowledgePointId)
      params.set("knowledgePointId", query.knowledgePointId);
    params.set(name, value);
    params.set("page", "1");
    if (!value) params.delete(name);
    router.push(`/teacher/questions?${params.toString()}`);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update("keyword", keyword.trim());
  }

  return (
    <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <form
        className="flex gap-2 sm:col-span-2 lg:col-span-4"
        onSubmit={submitSearch}
      >
        <label className="min-w-0 flex-1 space-y-1">
          <span className="text-xs font-medium">搜索题目</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            maxLength={120}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="输入标题、题干或完整标签"
            value={keyword}
          />
        </label>
        <button
          className="mt-5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          type="submit"
        >
          搜索
        </button>
      </form>
      <label className="space-y-1">
        <span className="text-xs font-medium">题库范围</span>
        <select
          className="w-full rounded-md border px-3 py-2"
          value={query.scope}
          onChange={(event) => update("scope", event.target.value)}
        >
          <option value="OWNED">我的题目</option>
          <option value="PUBLIC">公共题库</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium">题型</span>
        <select
          className="w-full rounded-md border px-3 py-2"
          value={query.type ?? ""}
          onChange={(event) => update("type", event.target.value)}
        >
          <option value="">全部题型</option>
          {Object.values(QuestionType).map((type) => (
            <option key={type} value={type}>
              {QUESTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium">知识点</span>
        <select
          className="w-full rounded-md border px-3 py-2"
          value={query.knowledgePointId ?? ""}
          onChange={(event) => update("knowledgePointId", event.target.value)}
        >
          <option value="">全部知识点</option>
          {knowledgePoints.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium">难度</span>
        <select
          className="w-full rounded-md border px-3 py-2"
          value={query.difficulty ?? ""}
          onChange={(event) => update("difficulty", event.target.value)}
        >
          <option value="">全部难度</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              难度 {value}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
