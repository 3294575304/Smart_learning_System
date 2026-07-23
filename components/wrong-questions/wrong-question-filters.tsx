"use client";

import { QuestionType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { WrongQuestionListQuery } from "@/services/wrong-questions/schemas";
import type { WrongQuestionListResult } from "@/services/wrong-questions/types";

interface Props {
  query: WrongQuestionListQuery;
  filterOptions: WrongQuestionListResult["filterOptions"];
}

export function WrongQuestionFilters({ query, filterOptions }: Props) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(query.keyword ?? "");

  function currentParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set("pageSize", String(query.pageSize));
    if (query.keyword) params.set("keyword", query.keyword);
    if (query.classroomId) params.set("classroomId", query.classroomId);
    if (query.knowledgePointId)
      params.set("knowledgePointId", query.knowledgePointId);
    if (query.type) params.set("type", query.type);
    if (query.isMastered !== undefined)
      params.set("isMastered", String(query.isMastered));
    if (query.recentDays) params.set("recentDays", String(query.recentDays));
    return params;
  }

  function update(name: string, value: string) {
    const params = currentParams();
    if (value) params.set(name, value);
    else params.delete(name);
    params.set("page", "1");
    router.push(`/student/wrong-questions?${params.toString()}`);
  }

  function submitKeyword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update("keyword", keyword.trim());
  }

  return (
    <section
      aria-label="错题筛选"
      className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-2 xl:grid-cols-5"
    >
      <form
        className="flex gap-2 md:col-span-2 xl:col-span-5"
        onSubmit={submitKeyword}
      >
        <label className="min-w-0 flex-1 space-y-1">
          <span className="text-xs font-medium">关键词</span>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            maxLength={120}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索题目标题或内容"
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
        <span className="text-xs font-medium">班级</span>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          onChange={(event) => update("classroomId", event.target.value)}
          value={query.classroomId ?? ""}
        >
          <option value="">全部班级</option>
          {filterOptions.classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium">知识点</span>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          onChange={(event) => update("knowledgePointId", event.target.value)}
          value={query.knowledgePointId ?? ""}
        >
          <option value="">全部知识点</option>
          {filterOptions.knowledgePoints.map((knowledgePoint) => (
            <option key={knowledgePoint.id} value={knowledgePoint.id}>
              {knowledgePoint.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium">题型</span>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          onChange={(event) => update("type", event.target.value)}
          value={query.type ?? ""}
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
        <span className="text-xs font-medium">掌握状态</span>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          onChange={(event) => update("isMastered", event.target.value)}
          value={query.isMastered === undefined ? "" : String(query.isMastered)}
        >
          <option value="">全部状态</option>
          <option value="false">未掌握</option>
          <option value="true">已掌握</option>
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-xs font-medium">最近错误</span>
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          onChange={(event) => update("recentDays", event.target.value)}
          value={query.recentDays ?? ""}
        >
          <option value="">全部时间</option>
          <option value="7">最近 7 天</option>
          <option value="30">最近 30 天</option>
          <option value="90">最近 90 天</option>
        </select>
      </label>
    </section>
  );
}
