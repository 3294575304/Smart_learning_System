"use client";

import { ChevronDown, Target } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { StudentPageLink } from "@/components/dashboard/student-page-link";
import {
  knowledgeStateColor,
  knowledgeStateDot,
} from "@/components/ui/knowledge-state";
import {
  STUDENT_KNOWLEDGE_STATES,
  type KnowledgeStatus,
} from "@/services/learner-profiles/knowledge-status";

/**
 * 章节掌握面板（学生端课程学习中心专用）。
 *
 * 与学习主页的 HomeKnowledgeMatrix 分开实现的原因：
 *   - 主页只需要「看一眼分布」，这里是「定位薄弱 → 去练」，需要筛选、排序、
 *     章节动作和可分享的展开状态；
 *   - 主页那份实现还被多个页面复用，直接改造回去的回归面太大。
 * 两者共用 knowledge-state 的颜色与形状定义，避免状态语义再次漂移。
 */
export type ChapterPanelChapter = {
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

type FilterId = "all" | "needs" | "developing" | "pending";
type SortId = "weak" | "order";

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "全部章节" },
  { id: "needs", label: "含需加强" },
  { id: "developing", label: "含巩固中" },
  { id: "pending", label: "含待评估" },
];

/** 「练本章」的落点：本章最该练的那个知识点。 */
const STATUS_PRIORITY: Record<KnowledgeStatus, number> = {
  NEEDS_SUPPORT: 0,
  DEVELOPING: 1,
  INSUFFICIENT: 2,
  NO_EVIDENCE: 3,
  MASTERED: 4,
};

function chapterStats(chapter: ChapterPanelChapter) {
  const counts: Record<KnowledgeStatus, number> = {
    MASTERED: 0,
    DEVELOPING: 0,
    NEEDS_SUPPORT: 0,
    INSUFFICIENT: 0,
    NO_EVIDENCE: 0,
  };
  for (const concept of chapter.concepts) counts[concept.status] += 1;
  const total = chapter.concepts.length;
  const assessed = counts.MASTERED + counts.DEVELOPING + counts.NEEDS_SUPPORT;
  const pending = counts.INSUFFICIENT + counts.NO_EVIDENCE;
  /** 薄弱度：需加强权重最高，其次巩固中，待评估只作提示。 */
  const weight =
    counts.NEEDS_SUPPORT * 3 + counts.DEVELOPING * 2 + counts.INSUFFICIENT;
  return { counts, total, assessed, pending, weight };
}

function weakestConcept(chapter: ChapterPanelChapter) {
  const candidates = chapter.concepts.filter((concept) => concept.conceptId);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (byStatus !== 0) return byStatus;
    return (a.masteryScore ?? 101) - (b.masteryScore ?? 101);
  })[0];
}

export function ChapterMasteryPanel({
  chapters,
  practiceBase,
  profileHref,
  generatedAt,
  profileRevision,
  readOnly = false,
}: {
  chapters: ChapterPanelChapter[];
  /** 练习入口前缀；为空表示不提供「练本章」（结课/只读班级）。 */
  practiceBase?: string | null;
  profileHref: string;
  generatedAt: string | null;
  profileRevision: number | null;
  readOnly?: boolean;
}) {
  /*
   * 展开状态写进 URL（?open=a,b），刷新、分享、从「查看评分依据」返回都不丢。
   * 用 replaceState 而不是 pushState：展开只是视图细节，不该污染浏览器后退栈。
   */
  const [open, setOpen] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("weak");

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("open");
    if (raw) setOpen(raw.split(",").filter(Boolean));
  }, []);

  function toggle(key: string) {
    const next = open.includes(key)
      ? open.filter((item) => item !== key)
      : [...open, key];
    setOpen(next);
    const params = new URLSearchParams(window.location.search);
    if (next.length) params.set("open", next.join(","));
    else params.delete("open");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }

  const decorated = useMemo(
    () =>
      chapters.map((chapter, index) => ({
        chapter,
        index,
        ...chapterStats(chapter),
      })),
    [chapters],
  );

  const filterCounts: Record<FilterId, number> = {
    all: decorated.length,
    needs: decorated.filter((item) => item.counts.NEEDS_SUPPORT > 0).length,
    developing: decorated.filter((item) => item.counts.DEVELOPING > 0).length,
    pending: decorated.filter((item) => item.pending > 0).length,
  };

  const visible = decorated
    .filter((item) =>
      filter === "needs"
        ? item.counts.NEEDS_SUPPORT > 0
        : filter === "developing"
          ? item.counts.DEVELOPING > 0
          : filter === "pending"
            ? item.pending > 0
            : true,
    )
    .sort((a, b) =>
      sort === "order"
        ? a.index - b.index
        : b.weight - a.weight ||
          b.counts.NEEDS_SUPPORT - a.counts.NEEDS_SUPPORT,
    );

  const conceptTotal = chapters.reduce(
    (sum, chapter) => sum + chapter.concepts.length,
    0,
  );

  return (
    <div>
      {/* 筛选与排序：把「11 章逐行读数字」变成一次点击。 */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div
          aria-label="章节筛选"
          className="border-line flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-0.5"
          role="group"
        >
          {FILTERS.map((option) => {
            const active = filter === option.id;
            return (
              <button
                aria-pressed={active}
                className={`min-h-9 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${
                  active
                    ? "bg-brand-soft text-brand-strong"
                    : "text-ink-soft hover:bg-muted hover:text-ink-body"
                }`}
                key={option.id}
                onClick={() => setFilter(option.id)}
                type="button"
              >
                {option.label}
                <span className="ml-1 tabular-nums opacity-70">
                  {filterCounts[option.id]}
                </span>
              </button>
            );
          })}
        </div>
        <button
          aria-label={`排序：${sort === "weak" ? "薄弱优先" : "章节顺序"}，点击切换`}
          className="text-ink-soft hover:bg-muted hover:text-ink-body border-line inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          onClick={() => setSort(sort === "weak" ? "order" : "weak")}
          type="button"
        >
          <Target aria-hidden="true" className="size-3.5" />
          {sort === "weak" ? "薄弱优先" : "章节顺序"}
        </button>
      </div>

      <p className="text-ink-soft mt-3 text-xs">
        共 {chapters.length} 章 · {conceptTotal} 个知识点
        {filter !== "all" ? `，当前筛选显示 ${visible.length} 章` : ""}
      </p>

      {visible.length ? (
        <div className="border-border mt-2 rounded-xl border px-2">
          {visible.map(({ chapter, counts, assessed, total }) => {
            const isOpen = open.includes(chapter.key);
            const pendingLabel =
              counts.INSUFFICIENT > 0 ? "待进一步评估" : "尚未评估";
            const label =
              assessed === 0
                ? pendingLabel
                : `已掌握 ${counts.MASTERED}/${assessed}`;
            const target = readOnly ? null : weakestConcept(chapter);
            const practiceHref =
              practiceBase && target?.conceptId
                ? `${practiceBase}&conceptId=${encodeURIComponent(target.conceptId)}`
                : null;
            return (
              <div
                className="border-border border-b last:border-0"
                key={chapter.key}
              >
                <div className="flex min-h-11 items-center gap-2">
                  <button
                    aria-expanded={isOpen}
                    className="hover:bg-muted flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                    onClick={() => toggle(chapter.key)}
                    type="button"
                  >
                    <span className="text-ink min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                      {chapter.name}
                    </span>
                    {/* 迷你条：让 11 章可以「看条长」比较，不必逐个读 n/m。 */}
                    <span
                      aria-hidden="true"
                      className="bg-muted hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-full sm:flex"
                    >
                      {(
                        [
                          "MASTERED",
                          "DEVELOPING",
                          "NEEDS_SUPPORT",
                          "INSUFFICIENT",
                          "NO_EVIDENCE",
                        ] as KnowledgeStatus[]
                      ).map((status) =>
                        counts[status] ? (
                          <span
                            className={knowledgeStateColor[status]}
                            key={status}
                            style={{ flexGrow: counts[status], flexBasis: 0 }}
                          />
                        ) : null,
                      )}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`text-ink-soft size-4 shrink-0 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <span
                    aria-label={
                      assessed === 0
                        ? `本章 ${total} 个知识点，${pendingLabel}`
                        : `已掌握 ${counts.MASTERED} 个，已评估 ${assessed} 个，共 ${total} 个知识点`
                    }
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap tabular-nums ${
                      assessed === 0
                        ? "bg-muted text-ink-soft"
                        : "bg-muted text-ink-body"
                    }`}
                  >
                    {label}
                  </span>
                  {practiceHref ? (
                    <Link
                      aria-label={`练习${chapter.name}最薄弱的知识点`}
                      className="text-brand-strong border-line hover:bg-muted inline-flex min-h-9 shrink-0 items-center rounded-md border px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                      href={practiceHref}
                    >
                      练本章
                    </Link>
                  ) : null}
                </div>
                {isOpen ? (
                  <ul className="space-y-2 px-2 pt-1 pb-3">
                    {chapter.concepts.length ? (
                      chapter.concepts.map((concept) => (
                        <li
                          className="bg-muted/65 rounded-md p-3 text-xs leading-5"
                          key={concept.key}
                        >
                          <p className="text-ink font-medium [overflow-wrap:anywhere]">
                            {concept.name}
                          </p>
                          <p className="text-ink-soft flex flex-wrap items-center gap-1">
                            <span
                              aria-hidden="true"
                              className={`mr-1 size-2.5 shrink-0 ${knowledgeStateDot[concept.status]}`}
                            />
                            {STUDENT_KNOWLEDGE_STATES[concept.status].label} ·{" "}
                            {concept.evidenceCount} 条评分记录
                            {concept.masteryScore !== null &&
                            concept.status !== "INSUFFICIENT" &&
                            concept.status !== "NO_EVIDENCE"
                              ? ` · ${concept.masteryScore.toFixed(1)} 分`
                              : ""}
                          </p>
                          <StudentPageLink
                            className="text-brand-strong mt-1 inline-flex min-h-10 items-center rounded-md px-2 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                            href={
                              concept.conceptId
                                ? `${profileHref}${profileHref.includes("?") ? "&" : "?"}conceptId=${encodeURIComponent(concept.conceptId)}#profile-concept-${encodeURIComponent(concept.conceptId)}`
                                : profileHref
                            }
                            aria-label={`查看评分依据：${concept.name}`}
                          >
                            查看评分依据
                          </StudentPageLink>
                        </li>
                      ))
                    ) : (
                      <li className="text-ink-soft text-xs">
                        本章尚无知识点。
                      </li>
                    )}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="bg-muted/65 text-ink-soft mt-2 rounded-xl p-5 text-sm">
          当前筛选下没有章节。完整章节共 {chapters.length}{" "}
          章，可切回「全部章节」查看。
        </p>
      )}

      <details className="border-border bg-muted/65 mt-3 rounded-xl border p-3">
        <summary className="text-ink cursor-pointer rounded-md text-sm font-medium">
          计算依据
        </summary>
        <div className="text-ink-body mt-3 space-y-2 text-xs leading-6">
          <p>
            掌握度按累计得分占对应满分的比例计算，统计本课程已公布的作业、考试成绩和练习评分。
          </p>
          <p>
            没有评分记录时显示「尚未评估」。少于 3
            条时先显示「待进一步评估」。记录充足后， 达到 80% 算已掌握，低于 60%
            需要加强，其余为巩固中。评分记录按题目统计， 一次作业可以有多条。
          </p>
          <p>
            章节右侧的「已掌握 n/m」中，m
            是本章已完成评估的知识点数，不含待评估与未评估，
            因此不会出现「0/N」被读成整章未掌握。
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
            className="bg-brand hover:bg-brand-strong inline-flex min-h-10 items-center rounded-md px-3 font-medium text-white"
            href={profileHref}
          >
            查看课程评分记录
          </StudentPageLink>
        </div>
      </details>
    </div>
  );
}
