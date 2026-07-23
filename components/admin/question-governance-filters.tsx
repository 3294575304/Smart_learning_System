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
    <form
      className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-3"
      method="get"
    >
      <input
        className="rounded-md border px-3 py-2 text-sm"
        defaultValue={query.keyword}
        maxLength={120}
        name="keyword"
        placeholder="搜索标题、题干或标签"
      />
      <select
        className="rounded-md border bg-white px-3 py-2 text-sm"
        defaultValue={query.type ?? ""}
        name="type"
      >
        <option value="">全部题型</option>
        {Object.values(QuestionType).map((type) => (
          <option key={type} value={type}>
            {QUESTION_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <select
        className="rounded-md border bg-white px-3 py-2 text-sm"
        defaultValue={query.knowledgePointId ?? ""}
        name="knowledgePointId"
      >
        <option value="">全部知识点</option>
        {knowledgePoints.map((point) => (
          <option key={point.id} value={point.id}>
            {point.name}（{point.code}）
          </option>
        ))}
      </select>
      <select
        className="rounded-md border bg-white px-3 py-2 text-sm"
        defaultValue={query.creatorId ?? ""}
        name="creatorId"
      >
        <option value="">全部创建者</option>
        {creators.map((creator) => (
          <option key={creator.id} value={creator.id}>
            {creator.displayName}（
            {creator.role === "ADMIN" ? "管理员" : "教师"}）
          </option>
        ))}
      </select>
      <select
        className="rounded-md border bg-white px-3 py-2 text-sm"
        defaultValue={query.visibility ?? ""}
        name="visibility"
      >
        <option value="">全部可见性</option>
        <option value={QuestionVisibility.PUBLIC}>公共</option>
        <option value={QuestionVisibility.PRIVATE}>私有</option>
      </select>
      <select
        className="rounded-md border bg-white px-3 py-2 text-sm"
        defaultValue={query.status ?? ""}
        name="status"
      >
        <option value="">全部状态</option>
        <option value={QuestionStatus.ACTIVE}>正常</option>
        <option value={QuestionStatus.INACTIVE}>已停用</option>
        <option value={QuestionStatus.ARCHIVED}>已归档</option>
        <option value={QuestionStatus.DRAFT}>草稿</option>
      </select>
      <div className="flex gap-2 md:col-span-3">
        <button
          className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white"
          type="submit"
        >
          筛选
        </button>
        <Link
          className="rounded-md border px-4 py-2 text-sm"
          href="/admin/questions"
        >
          重置
        </Link>
      </div>
      <input name="pageSize" type="hidden" value={query.pageSize} />
    </form>
  );
}
