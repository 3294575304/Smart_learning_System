"use client";
import { StudentPageLink } from "./student-page-link";
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FOCUS_RING, FOCUS_RING_TIGHT } from "./ui-focus";
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
  DEVELOPING: "bg-brand-strong",
  NEEDS_SUPPORT: "bg-rose-600",
  INSUFFICIENT: "bg-amber-500",
  NO_EVIDENCE: "bg-neutral-400",
};

/**
 * 五态不能只靠颜色。色弱用户、灰度打印、以及截图降采样之后，
 * "已掌握（绿）"和"巩固中（蓝）"会退化成同一个灰点，等于没有区分。
 * 这里给每一态补一个形状，与颜色叠加成双重编码：
 *   已掌握 = 实心圆 · 巩固中 = 半实心圆 · 需加强 = 菱形
 *   待进一步评估 = 粗环 · 尚未评估 = 虚线环
 * 分布条高度只有 8px，承载不了形状，仍只用颜色；形状用在图例与概念行上，
 * 而那两处本来就紧挨着状态文字，形状是冗余提示而非唯一信息。
 */
const stateDot: Record<KnowledgeStatus, string> = {
  MASTERED: "rounded-full bg-emerald-600",
  DEVELOPING:
    "rounded-full border border-brand-strong bg-gradient-to-r from-brand-strong from-50% to-transparent to-50%",
  NEEDS_SUPPORT: "rotate-45 rounded-[1px] bg-rose-600",
  INSUFFICIENT: "rounded-full border-2 border-amber-500 bg-transparent",
  NO_EVIDENCE:
    "rounded-full border border-dashed border-neutral-400 bg-transparent",
};

export function HomeKnowledgeMatrix({
  chapters,
  profileHref,
  generatedAt,
  profileRevision,
  dashboard = false,
}: {
  chapters: HomeKnowledgeChapter[];
  profileHref: string;
  generatedAt: string | null;
  profileRevision: number | null;
  dashboard?: boolean;
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
  const distributionPanel = distribution.length > 0 && (
    <div className="bg-muted/65 mb-3 rounded-xl px-3 py-3">
      <div
        aria-hidden="true"
        className="bg-muted flex h-2 overflow-hidden rounded-full"
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
        className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-700"
      >
        {distribution.map(({ status, count }) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 ${stateDot[status]}`}
            />
            {STUDENT_KNOWLEDGE_STATES[status].label}
            <strong className="font-semibold tabular-nums">{count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
  const matrix = (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">
          共 {chapters.length} 章 · {concepts.length} 个知识点
        </p>
        {chapters.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="home-knowledge-chapters"
            onClick={() => setExpanded(!expanded)}
            className={`text-brand-strong hover:bg-muted min-h-10 rounded-md px-3 text-sm font-medium ${FOCUS_RING}`}
          >
            {expanded ? "收起章节" : "展开全部"}
          </button>
        )}
      </div>
      {!dashboard && distributionPanel}
      {chapters.length ? (
        <div
          id="home-knowledge-chapters"
          role="region"
          aria-label="全部章节，展开章节查看知识点"
          tabIndex={0}
          className={`${expanded ? "" : "max-h-56 overflow-y-auto overscroll-y-contain"} border-border [scrollbar-gutter:stable] rounded-xl border px-2 ${FOCUS_RING_TIGHT}`}
        >
          {chapters.map((chapter) => {
            const assessed = chapter.concepts.filter(
              (c) => c.status !== "NO_EVIDENCE" && c.status !== "INSUFFICIENT",
            ).length;
            const pendingLabel = chapter.concepts.some(
              (c) => c.status === "INSUFFICIENT",
            )
              ? "待进一步评估"
              : "尚未评估";
            const mastered = chapter.concepts.filter(
              (c) => c.status === "MASTERED",
            ).length;
            return (
              <details
                key={chapter.key}
                className="group border-border border-b last:border-0"
              >
                <summary
                  className={`group-open:bg-muted hover:bg-muted flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm ${FOCUS_RING_TIGHT} [&::-webkit-details-marker]:hidden`}
                >
                  <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere] text-neutral-800">
                    {chapter.name}
                  </span>
                  {/* 分母取「已评估」数：未评估章节不显示 0/N，避免被读成整章未掌握。 */}
                  <span
                    aria-label={
                      assessed === 0
                        ? `本章 ${chapter.concepts.length} 个知识点，${pendingLabel}`
                        : `已掌握 ${mastered} 个，已评估 ${assessed} 个，共 ${chapter.concepts.length} 个知识点`
                    }
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                      assessed === 0
                        ? "bg-muted text-neutral-500"
                        : "bg-muted text-neutral-700"
                    }`}
                  >
                    {assessed === 0
                      ? pendingLabel
                      : `已掌握 ${mastered}/${assessed}`}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-neutral-600 group-open:rotate-180"
                  />
                </summary>
                <ul className="space-y-2 px-2 pt-2 pb-3">
                  {chapter.concepts.length ? (
                    chapter.concepts.map((c) => (
                      <li
                        key={c.key}
                        className="bg-muted/65 rounded-md p-3 text-xs leading-5"
                      >
                        <p className="font-medium [overflow-wrap:anywhere] text-neutral-900">
                          {c.name}
                        </p>
                        <p className="flex flex-wrap items-center gap-1 text-neutral-600">
                          <span
                            aria-hidden="true"
                            className={`mr-1 size-2.5 shrink-0 ${stateDot[c.status]}`}
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
                          className={`text-brand-strong mt-1 inline-flex min-h-10 items-center rounded-md px-2 font-medium underline underline-offset-4 ${FOCUS_RING}`}
                          aria-label={`查看评分依据：${c.name}`}
                        >
                          查看评分依据
                        </StudentPageLink>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-neutral-600">
                      本章尚无知识点。
                    </li>
                  )}
                </ul>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="bg-muted/65 rounded-xl p-5 text-sm text-neutral-600">
          暂无章节，教师发布课程知识图谱后可在这里查看。
        </p>
      )}
      <details className="border-border bg-muted/65 mt-3 rounded-xl border p-3">
        <summary
          className={`cursor-pointer rounded-md text-sm font-medium text-neutral-800 ${FOCUS_RING_TIGHT}`}
        >
          计算依据
        </summary>
        <div className="mt-3 space-y-2 text-xs leading-6 text-neutral-700">
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
            className={`bg-brand hover:bg-brand-strong inline-flex min-h-10 items-center rounded-md px-3 font-medium text-white ${FOCUS_RING}`}
          >
            查看课程评分记录
          </StudentPageLink>
        </div>
      </details>
    </>
  );
  if (!dashboard) return matrix;
  const practice = concepts.filter(
    (concept) =>
      concept.status === "DEVELOPING" || concept.status === "NEEDS_SUPPORT",
  ).length;
  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-neutral-800">
          {concepts.length ? `共 ${concepts.length} 个知识点` : "暂无知识点"}
        </p>
        {practice > 0 && (
          <p className="text-brand-strong text-sm font-medium tabular-nums">
            {practice} 个待巩固
          </p>
        )}
      </div>
      {distributionPanel}
      {!concepts.length && (
        <p className="text-sm leading-5 text-neutral-600">
          {chapters.length
            ? "本课程的章节还未配置知识点。"
            : "教师发布课程知识图谱后可在这里查看。"}
        </p>
      )}
      <details className="mt-2">
        <summary
          className={`min-h-10 cursor-pointer content-center rounded-md text-sm font-medium ${FOCUS_RING_TIGHT}`}
        >
          查看章节与依据
        </summary>
        {matrix}
      </details>
    </div>
  );
}
