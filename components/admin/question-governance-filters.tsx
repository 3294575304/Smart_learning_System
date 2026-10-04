"use client";

import {
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
} from "@prisma/client";
import Link from "next/link";

import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { AdminQuestionListQuery } from "@/services/admin/questions/schemas";
import type { AdminQuestionCreatorOption } from "@/services/admin/questions/types";
import type { KnowledgePointOption } from "@/services/questions/types";

export function QuestionGovernanceFilters({
  query,
  creators,
  knowledgePoints,
}: {
  query: AdminQuestionListQuery;
  creators: AdminQuestionCreatorOption[];
  knowledgePoints: KnowledgePointOption[];
}) {
  return (
    <form className="space-y-4 rounded-xl border bg-white p-4" method="get">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-600">关键词</span>
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          defaultValue={query.keyword}
          maxLength={120}
          name="keyword"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="搜索标题、题干或标签"
        />
      </label>

      <fieldset className="space-y-3 border-t pt-3">
        <legend className="px-1 text-xs font-semibold text-gray-500">
          题目内容与来源
        </legend>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">题型</span>
            <select
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              defaultValue={query.type ?? ""}
              name="type"
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
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
            <span className="text-xs font-medium text-gray-600">知识点</span>
            <select
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              defaultValue={query.knowledgePointId ?? ""}
              name="knowledgePointId"
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="">全部知识点</option>
              {knowledgePoints.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.name}（{point.code}）
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">创建者</span>
            <select
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              defaultValue={query.creatorId ?? ""}
              name="creatorId"
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="">全部创建者</option>
              {creators.map((creator) => (
                <option key={creator.id} value={creator.id}>
                  {creator.displayName}（
                  {creator.role === "ADMIN" ? "管理员" : "教师"}）
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t pt-3">
        <legend className="px-1 text-xs font-semibold text-gray-500">
          治理状态
        </legend>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">可见性</span>
            <select
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              defaultValue={query.visibility ?? ""}
              name="visibility"
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="">全部可见性</option>
              <option value={QuestionVisibility.PUBLIC}>公共</option>
              <option value={QuestionVisibility.PRIVATE}>私有</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-600">状态</span>
            <select
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              defaultValue={query.status ?? ""}
              name="status"
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="">全部状态</option>
              <option value={QuestionStatus.ACTIVE}>正常</option>
              <option value={QuestionStatus.INACTIVE}>已停用</option>
              <option value={QuestionStatus.ARCHIVED}>已归档</option>
              <option value={QuestionStatus.DRAFT}>草稿</option>
            </select>
          </label>
          <div className="flex items-end justify-end">
            <Link
              className="rounded-md border px-4 py-2 text-sm"
              href="/admin/questions"
            >
              重置
            </Link>
          </div>
        </div>
      </fieldset>
      <input name="pageSize" type="hidden" value={query.pageSize} />
    </form>
  );
}
