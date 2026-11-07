"use client";
import { StudentPageLink } from "./student-page-link";
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  STUDENT_KNOWLEDGE_STATES,
  type KnowledgeStatus,
} from "@/services/learner-profiles/knowledge-status";

export type HomeKnowledgeChapter = {
  key: string;
  name: string;
  concepts: Array<{
    key: string;
    conceptId?: string | null;
    name: string;
    status: KnowledgeStatus;
    evidenceCount: number;
    masteryScore: number | null;
  }>;
};

const stateColor: Record<KnowledgeStatus, string> = {
  MASTERED: "bg-emerald-600",
  DEVELOPING: "bg-sky-600",
  NEEDS_SUPPORT: "bg-rose-600",
  INSUFFICIENT: "bg-amber-500",
  NO_EVIDENCE: "bg-slate-400",
};

export function HomeKnowledgeMatrix({
  chapters,
  profileHref,
  generatedAt,
  profileRevision,
}: {
  chapters: HomeKnowledgeChapter[];
  profileHref: string;
  generatedAt: string | null;
  profileRevision: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const concepts = [
    ...new Map(
      chapters.flatMap((c) => c.concepts).map((c) => [c.key, c]),
    ).values(),
  ];
  const distribution = (Object.keys(stateColor) as KnowledgeStatus[])
    .map((status) => ({
      status,
      count: concepts.filter((concept) => concept.status === status).length,
    }))
    .filter(({ count }) => count > 0);
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          共 {chapters.length} 章 · {concepts.length} 个知识点
        </p>
        {chapters.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="home-knowledge-chapters"
            onClick={() => setExpanded(!expanded)}
            className="min-h-10 rounded-lg px-3 text-sm font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700"
          >
            {expanded ? "收起章节" : "展开全部"}
          </button>
        )}
      </div>
      {distribution.length > 0 && (
        <div className="mb-3 rounded-xl bg-slate-50 px-3 py-3">
          <div
            aria-hidden="true"
            className="flex h-2 overflow-hidden rounded-full bg-slate-200"
          >
            {distribution.map(({ status, count }) => (
              <span
                key={status}
                className={stateColor[status]}
                style={{ flexGrow: count, flexBasis: 0 }}
              />
            ))}
          </div>
          <ul
            aria-label="知识状态分布"
            className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-700"
          >
            {distribution.map(({ status, count }) => (
              <li key={status} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${stateColor[status]}`}
                />
                {STUDENT_KNOWLEDGE_STATES[status].label}
                <strong className="font-semibold tabular-nums">{count}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      {chapters.length ? (
        <div
          id="home-knowledge-chapters"
          role="region"
          aria-label="全部章节，展开章节查看知识点"
          tabIndex={0}
          className={`${expanded ? "" : "max-h-56 overflow-y-auto overscroll-y-contain"} [scrollbar-gutter:stable] rounded-xl border border-slate-200 px-2 focus-visible:outline-2 focus-visible:outline-sky-700`}
        >
          {chapters.map((chapter) => {
            const assessed = chapter.concepts.filter(
              (c) => c.status !== "NO_EVIDENCE",
            ).length;
            const mastered = chapter.concepts.filter(
              (c) => c.status === "MASTERED",
            ).length;
            return (
              <details
                key={chapter.key}
                className="group border-b border-slate-100 last:border-0"
              >
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-sm group-open:bg-sky-50 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere] text-slate-800">
                    {chapter.name}
                  </span>
                  {/* 分母取「已评估」数：未评估章节不显示 0/N，避免被读成整章未掌握。 */}
                  <span
                    aria-label={
                      assessed === 0
                        ? `本章 ${chapter.concepts.length} 个知识点尚未评估`
                        : `已掌握 ${mastered} 个，已评估 ${assessed} 个，共 ${chapter.concepts.length} 个知识点`
                    }
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs tabular-nums ${
                      assessed === 0
                        ? "bg-slate-100 text-slate-500"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {assessed === 0
                      ? "尚未评估"
                      : `已掌握 ${mastered}/${assessed}`}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-slate-600 group-open:rotate-180"
                  />
                </summary>
                <ul className="space-y-2 px-2 pt-2 pb-3">
                  {chapter.concepts.length ? (
                    chapter.concepts.map((c) => (
                      <li
                        key={c.key}
                        className="rounded-lg bg-slate-50 p-3 text-xs leading-5"
                      >
                        <p className="font-medium [overflow-wrap:anywhere] text-slate-900">
                          {c.name}
                        </p>
                        <p className="flex flex-wrap items-center gap-1 text-slate-600">
                          <span
                            aria-hidden="true"
                            className={`mr-1 size-2 rounded-full ${stateColor[c.status]}`}
                          />
                          {STUDENT_KNOWLEDGE_STATES[c.status].label} ·{" "}
                          {c.evidenceCount} 条有效证据
                          {c.masteryScore !== null &&
                          c.status !== "INSUFFICIENT" &&
                          c.status !== "NO_EVIDENCE"
                            ? ` · ${c.masteryScore.toFixed(1)} 分`
                            : ""}
                        </p>
                        <StudentPageLink
                          href={
                            c.conceptId
                              ? `${profileHref}${profileHref.includes("?") ? "&" : "?"}conceptId=${encodeURIComponent(c.conceptId)}#profile-concept-${encodeURIComponent(c.conceptId)}`
                              : profileHref
                          }
                          className="mt-1 inline-flex min-h-9 items-center rounded-md px-2 font-medium text-sky-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-sky-700"
                          aria-label={`查看评分依据：${c.name}`}
                        >
                          查看评分依据
                        </StudentPageLink>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-slate-600">本章尚无知识点。</li>
                  )}
                </ul>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
          暂无章节，教师发布课程知识图谱后可在这里查看。
        </p>
      )}
      <details className="mt-3 rounded-lg border border-sky-100 bg-sky-50/40 p-3">
        <summary className="cursor-pointer rounded text-sm font-medium text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700">
          计算依据
        </summary>
        <div className="mt-3 space-y-2 text-xs leading-6 text-slate-700">
          <p>
            掌握分值 = 有效评分证据得分之和 ÷ 对应满分之和 ×
            100。证据来自本课程已评分的作业与练习。
          </p>
          <p>
            没有证据时显示“尚未评估”；不足 3
            条时显示“待进一步评估”。证据充足后，80 分及以上为已掌握，60–79
            分为巩固中，低于 60 分为需加强。3 条证据不代表 3 次作业。
          </p>
          <p>
            知识画像按课程汇总；作业与教学进度按本班统计。出勤和自述不直接改变客观掌握度。尚未评估不算零分。
          </p>
          <p>
            画像版本：{profileRevision ?? "暂无"} · 更新时间：
            {generatedAt
              ? new Date(generatedAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })
              : "暂无画像"}
          </p>
          <StudentPageLink
            href={profileHref}
            className="inline-flex min-h-10 items-center rounded-lg bg-sky-700 px-3 font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            查看课程评分记录
          </StudentPageLink>
        </div>
      </details>
    </>
  );
}
