"use client";
import { StudentPageLink } from "./student-page-link";
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FOCUS_RING, FOCUS_RING_TIGHT } from "./ui-focus";
import {
  knowledgeStateColor,
  knowledgeStateDot,
} from "@/components/ui/knowledge-state";
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
    /** 是否已纳入教学进度。传入后章节行会显式标注「已授 N」，避免与概况页的「达到掌握」口径混淆。 */
    taught?: boolean;
    evidenceCount: number;
    masteryScore: number | null;
  }>;
};

export function HomeKnowledgeMatrix({
  chapters,
  profileHref,
  generatedAt,
  profileRevision,
  dashboard = false,
  scroll = true,
}: {
  chapters: HomeKnowledgeChapter[];
  profileHref: string;
  generatedAt: string | null;
  profileRevision: number | null;
  dashboard?: boolean;
  /**
   * 是否把章节列表限制在卡内滚动。
   * 学习主页需要（页面很长），课程学习中心不需要 —— 那里再套一层滚动就是双层滚动，
   * 手机上很难滚得动。默认 true 保持既有调用方行为不变。
   */
  scroll?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const concepts = [
    ...new Map(
      chapters.flatMap((c) => c.concepts).map((c) => [c.key, c]),
    ).values(),
  ];
  const distribution = (Object.keys(knowledgeStateColor) as KnowledgeStatus[])
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
            className={knowledgeStateColor[status]}
            style={{ flexGrow: count, flexBasis: 0 }}
          />
        ))}
      </div>
      <ul
        aria-label="知识状态分布"
        className="text-ink-body mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs"
      >
        {distribution.map(({ status, count }) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 ${knowledgeStateDot[status]}`}
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
        <p className="text-ink-soft text-xs">
          共 {chapters.length} 章 · {concepts.length} 个知识点
        </p>
        {scroll && chapters.length > 0 && (
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
          className={`${!scroll || expanded ? "" : "max-h-56 overflow-y-auto overscroll-y-contain"} border-border [scrollbar-gutter:stable] rounded-xl border px-2 ${FOCUS_RING_TIGHT}`}
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
            // 概况页的「达到掌握」分母是稳定结论数，章节行的分母是已评估数，
            // 两者写法一样但口径不同。顶层传了 taught 时把「已授」写出来区分。
            const hasTaught = chapter.concepts.some(
              (c) => c.taught !== undefined,
            );
            const taughtCount = chapter.concepts.filter((c) => c.taught).length;
            const pillLabel = hasTaught
              ? `已授 ${taughtCount} · 掌握 ${mastered}/${assessed}`
              : `已掌握 ${mastered}/${assessed}`;
            return (
              <details
                key={chapter.key}
                className="group border-border border-b last:border-0"
              >
                <summary
                  className={`group-open:bg-muted hover:bg-muted flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm ${FOCUS_RING_TIGHT} [&::-webkit-details-marker]:hidden`}
                >
                  <span className="text-ink min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                    {chapter.name}
                  </span>
                  {/* 分母取「已评估」数：未评估章节不显示 0/N，避免被读成整章未掌握。 */}
                  <span
                    aria-label={
                      assessed === 0
                        ? `本章 ${chapter.concepts.length} 个知识点，${pendingLabel}`
                        : hasTaught
                          ? `已授 ${taughtCount} 个，已掌握 ${mastered} 个，已评估 ${assessed} 个，共 ${chapter.concepts.length} 个知识点`
                          : `已掌握 ${mastered} 个，已评估 ${assessed} 个，共 ${chapter.concepts.length} 个知识点`
                    }
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap tabular-nums ${
                      assessed === 0
                        ? "bg-muted text-ink-soft"
                        : "bg-muted text-ink-body"
                    }`}
                  >
                    {assessed === 0 ? pendingLabel : pillLabel}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="text-ink-soft size-4 shrink-0 group-open:rotate-180"
                  />
                </summary>
                <ul className="space-y-2 px-2 pt-2 pb-3">
                  {chapter.concepts.length ? (
                    chapter.concepts.map((c) => (
                      <li
                        key={c.key}
                        className="bg-muted/65 rounded-md p-3 text-xs leading-5"
                      >
                        <p className="text-ink font-medium [overflow-wrap:anywhere]">
                          {c.name}
                        </p>
                        <p className="text-ink-soft flex flex-wrap items-center gap-1">
                          <span
                            aria-hidden="true"
                            className={`mr-1 size-2.5 shrink-0 ${knowledgeStateDot[c.status]}`}
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
                    <li className="text-ink-soft text-xs">本章尚无知识点。</li>
                  )}
                </ul>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="bg-muted/65 text-ink-soft rounded-xl p-5 text-sm">
          暂无章节，教师发布课程知识图谱后可在这里查看。
        </p>
      )}
      <details className="border-border bg-muted/65 mt-3 rounded-xl border p-3">
        <summary
          className={`text-ink cursor-pointer rounded-md text-sm font-medium ${FOCUS_RING_TIGHT}`}
        >
          计算依据
        </summary>
        <div className="text-ink-body mt-3 space-y-2 text-xs leading-6">
          <p>
            掌握度按累计得分占对应满分的比例计算，统计本课程已公布的作业、考试成绩和练习评分。
          </p>
          <p>
            没有评分记录时显示“尚未评估”。少于 3
            条时，先显示“待进一步评估”。记录充足后，掌握度达到 80%
            算已掌握，低于 60%
            需要加强，其余为巩固中。评分记录按题目统计，一次作业可以有多条。
          </p>
          <p>
            知识掌握按整门课统计。出勤和自我反思单独展示，尚未评估的知识点会保留为空。
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
        <p className="text-ink text-sm font-medium">
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
        <p className="text-ink-soft text-sm leading-5">
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
