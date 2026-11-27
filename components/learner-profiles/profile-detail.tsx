import type { LearnerProfileEvidenceState } from "@prisma/client";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Panel, SectionHeading } from "@/components/ui/panel";
import type { getStudentLearnerProfile } from "@/services/learner-profiles/service";
import {
  DIMENSION_REGISTRY,
  type DimensionKey,
} from "@/services/learner-profiles/dimension-registry";

type Profile = Awaited<ReturnType<typeof getStudentLearnerProfile>>;

const evidenceLabels: Record<LearnerProfileEvidenceState, string> = {
  NO_EVIDENCE: "尚未评估",
  INSUFFICIENT_EVIDENCE: "待进一步评估",
  CONCLUSIVE: "已评估",
};

const evidenceStyles: Record<LearnerProfileEvidenceState, string> = {
  NO_EVIDENCE: "border-slate-200 bg-slate-50 text-slate-600",
  INSUFFICIENT_EVIDENCE: "border-amber-200 bg-amber-50 text-amber-800",
  CONCLUSIVE: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

/**
 * 覆盖度用单一色阶（天蓝由深到浅），刻意不复用状态色。
 *
 * 原来的「记录充足」用翠绿，和「章节掌握」里「已掌握」的翠绿同色不同义，
 * 学生跨页看到的绿其实是两件事。色阶只表达「覆盖了多少」，不表达「好不好」。
 */
const COVERAGE_LEGEND = [
  { key: "stable", label: "记录充足", className: "bg-sky-700" },
  { key: "insufficient", label: "记录较少", className: "bg-sky-300" },
  {
    key: "unassessed",
    label: "尚未评估",
    className: "bg-sky-100 ring-1 ring-sky-200 ring-inset",
  },
] as const;

/** 五维分两组：客观掌握可以直接横向比较，行为与自述只作辅助理解。 */
const DIMENSION_GROUPS: Array<{
  title: string;
  hint: string;
  keys: DimensionKey[];
  columns: string;
}> = [
  {
    title: "客观掌握",
    hint: "来自出勤、评分记录与判题结果，可以和同学、和自己上次比较。",
    keys: ["objectiveMastery", "attendance", "programming"],
    columns: "sm:grid-cols-3",
  },
  {
    title: "学习行为与自述",
    hint: "活跃度只统计有评分事件的日期，自我反思是学生自述，两者都不参与客观掌握度。",
    keys: ["activity", "reflection"],
    columns: "sm:grid-cols-2",
  },
];

export interface ProfileQuickLinks {
  /** 章节掌握板块（含按章节下钻）。 */
  knowledge?: string;
  /** 自主练习（生成条件页）。 */
  practice?: string;
  /** 签到与出勤。 */
  attendance?: string;
}

export function LearnerProfileDetail({
  profile,
  focusConceptId,
  studentView = false,
  reflectionHref,
  evidenceHref,
  links,
}: {
  profile: Profile;
  focusConceptId?: string;
  studentView?: boolean;
  /** 学生端：跳转到自主练习里的自我反思面板。 */
  reflectionHref?: string;
  evidenceHref?: string;
  /** 学生端的动作入口；教师端不传，卡片只读。 */
  links?: ProfileQuickLinks;
}) {
  const dimensions = profile.dimensions as unknown as Record<string, unknown>;

  const allConcepts = profile.concepts;
  const courseTotal = allConcepts.length;
  const courseStable = allConcepts.filter(
    (point) => point.evidenceState === "CONCLUSIVE",
  ).length;
  const courseInsufficient = allConcepts.filter(
    (point) => point.evidenceState === "INSUFFICIENT_EVIDENCE",
  ).length;
  const courseUnassessed = allConcepts.filter(
    (point) => point.evidenceState === "NO_EVIDENCE",
  ).length;
  const focusedConcept = focusConceptId
    ? (allConcepts.find((point) => point.conceptId === focusConceptId) ?? null)
    : null;

  function cardAction(key: DimensionKey, fallback?: ReactNode) {
    if (!studentView) return undefined;
    if (key === "reflection") return fallback;
    const target =
      key === "objectiveMastery"
        ? links?.knowledge
        : key === "activity"
          ? links?.practice
          : key === "attendance"
            ? links?.attendance
            : undefined;
    if (!target) return undefined;
    const label =
      key === "objectiveMastery"
        ? "看需要再练的知识点"
        : key === "activity"
          ? "去做一组练习"
          : "查看签到记录";
    return (
      <Link
        className="text-brand-strong mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        href={target}
      >
        {label}
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <Panel>
        <SectionHeading
          actions={
            <div className="text-ink-soft text-right text-xs">
              <p>数据更新于</p>
              <p className="mt-1">
                {profile.generatedAt.toLocaleString("zh-CN")}
              </p>
            </div>
          }
          description="五个维度各自取自不同的学习记录：出勤看考勤、掌握度看评分记录、活跃度看近期事件、反思是学生自述、编程看判题结果。它们不会相互覆盖。"
          level="page"
          title={studentView ? "我的画像" : "学习者画像"}
        />
        <p className="text-ink-body mt-3 max-w-[70ch] text-sm leading-6">
          {profile.summary}
        </p>
        {/*
          分组渲染而不是五张平铺：客观三项可以直接比，行为与自述两项只能辅助理解。
          原来 5 张卡放在 3 列网格里，第二行空一格，也没有语义提示。
        */}
        <div className="mt-4 space-y-4">
          {DIMENSION_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-ink text-[13px] font-semibold">
                  {group.title}
                </h3>
                <p className="text-ink-soft text-[11px] leading-5">
                  {group.hint}
                </p>
              </div>
              <div className={`mt-2 grid gap-3 ${group.columns}`}>
                {group.keys.map((key) => {
                  const definition = DIMENSION_REGISTRY.find(
                    (item) => item.key === key,
                  );
                  if (!definition) return null;
                  const card = definition.build(
                    dimensions[definition.key],
                    Boolean(studentView),
                  );
                  const reflectionAction =
                    card.action === "reflection" && reflectionHref ? (
                      <Link
                        className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs font-medium text-amber-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                        href={reflectionHref}
                      >
                        {card.actionLabel}
                        <ArrowUpRight aria-hidden="true" className="size-3.5" />
                      </Link>
                    ) : undefined;
                  return (
                    <DimensionCard
                      action={cardAction(definition.key, reflectionAction)}
                      detail={card.detail}
                      headline={card.headline}
                      key={definition.key}
                      label={card.label}
                      state={card.state}
                      tone={card.tone}
                      unit={card.unit}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="text-ink-soft mt-3 text-xs leading-5">
          知识点掌握度按已公布评分记录的累计得分与满分计算，再汇总评分记录达到评估要求的概念。
          活跃度只统计作业/练习的评分事件，不代表努力程度；自我反思是学生自述，两者都不参与客观掌握度与课程总评。
        </p>
      </Panel>

      {studentView ? (
        <Panel>
          <SectionHeading
            actions={
              links?.knowledge ? (
                <Link
                  className="border-line bg-card text-ink-body hover:bg-muted inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                  href={links.knowledge}
                >
                  查看章节明细
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </Link>
              ) : undefined
            }
            description="这里只汇总评分覆盖情况。逐章、逐知识点的状态与评分依据统一放在「章节掌握」，避免同一批章节在两个板块各给一套数字。"
            level="page"
            title="评分覆盖"
          />
          {courseTotal > 0 ? (
            <CoverageBar
              stable={courseStable}
              insufficient={courseInsufficient}
              unassessed={courseUnassessed}
              total={courseTotal}
            />
          ) : (
            <p className="text-ink-soft mt-5 py-6 text-center text-sm">
              暂无正式章节结构，请等待教师发布课程图谱。
            </p>
          )}
          <p className="text-ink-soft mt-3 text-xs leading-5">
            章节熟练度按已有评分知识点取平均，仅供学习参考；评分记录较少时不形成稳定结论。
          </p>
          {/*
            深链保留：从章节列表点「查看评分依据」会带 conceptId 过来，
            这里直接展开该知识点的评分依据，锚点 id 与跳转约定保持一致。
          */}
          {focusedConcept ? (
            <div
              className="border-line mt-4 scroll-mt-24 rounded-xl border p-4"
              id={`profile-concept-${focusedConcept.conceptId}`}
              tabIndex={-1}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-ink text-sm font-medium">
                  {focusedConcept.name}
                </h3>
                <span className="text-sm font-semibold text-sky-800">
                  {focusedConcept.masteryScore === null
                    ? "尚未评估"
                    : `${focusedConcept.masteryScore}%`}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-50">
                <div
                  className="h-full rounded-full bg-sky-600"
                  style={{ width: `${focusedConcept.masteryScore ?? 0}%` }}
                />
              </div>
              <p className="text-ink-soft mt-2 text-xs">
                {evidenceLabels[focusedConcept.evidenceState]} ·{" "}
                {focusedConcept.evidenceCount} 条评分记录 · 结论可靠度{" "}
                {Math.round(focusedConcept.confidence * 100)}%
              </p>
              {focusedConcept.historicalEvidence.latestReferences.length ? (
                <div className="mt-3 space-y-2">
                  {focusedConcept.historicalEvidence.latestReferences.map(
                    (item) => (
                      <div
                        className="bg-muted/60 rounded-lg p-3 text-sm"
                        key={item.evidenceId}
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium">
                            {item.assignmentName} · {item.questionName}
                          </span>
                          <span className="tabular-nums">
                            {item.score}/{item.maxScore} 分
                          </span>
                        </div>
                        <p className="text-ink-soft mt-1 text-xs">
                          {item.gradedAt.toLocaleString("zh-CN")} · 评分修订{" "}
                          {item.revision}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              ) : evidenceHref && focusedConcept.evidenceCount > 0 ? (
                <a
                  className="text-brand-strong mt-2 inline-flex min-h-10 items-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                  href={`${evidenceHref}&conceptId=${encodeURIComponent(focusedConcept.conceptId)}#profile-concept-${encodeURIComponent(focusedConcept.conceptId)}`}
                >
                  查看评分依据
                </a>
              ) : null}
            </div>
          ) : null}
        </Panel>
      ) : (
        /* 教师端保留逐章明细：教师需要按章下钻，向学生解释某一章为什么是这个结论。 */
        <Panel>
          <SectionHeading
            description="章节熟练度根据已有评分记录计算。展开章节可查看每个知识点的状态和评分依据，未评估的知识点不按零分计。"
            level="page"
            title="章节熟练度与评估覆盖"
          />
          {profile.chapters.length > 0 ? (
            <div className="border-line mt-4 rounded-xl border">
              <CoverageBar
                stable={courseStable}
                insufficient={courseInsufficient}
                unassessed={courseUnassessed}
                total={courseTotal}
                bordered
              />
              <div className="divide-y">
                {profile.chapters.map((chapter) => {
                  const points = chapter.conceptIds.flatMap((id) => {
                    const point = profile.concepts.find(
                      (item) => item.conceptId === id,
                    );
                    return point ? [point] : [];
                  });
                  const scored = points.filter(
                    (point) => point.masteryScore !== null,
                  );
                  const average = scored.length
                    ? Math.round(
                        scored.reduce(
                          (sum, point) => sum + (point.masteryScore ?? 0),
                          0,
                        ) / scored.length,
                      )
                    : null;
                  const stable = points.filter(
                    (point) => point.evidenceState === "CONCLUSIVE",
                  ).length;
                  const insufficient = points.filter(
                    (point) => point.evidenceState === "INSUFFICIENT_EVIDENCE",
                  ).length;
                  const unassessed = points.filter(
                    (point) => point.evidenceState === "NO_EVIDENCE",
                  ).length;
                  return (
                    <ChapterRow
                      key={chapter.id}
                      chapter={chapter}
                      concepts={points}
                      average={average}
                      stable={stable}
                      insufficient={insufficient}
                      unassessed={unassessed}
                      focusConceptId={focusConceptId}
                      evidenceHref={evidenceHref}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-ink-soft mt-5 py-6 text-center text-sm">
              暂无正式章节结构，请等待教师发布课程图谱。
            </p>
          )}
          <p className="text-ink-soft mt-4 text-xs">
            章节熟练度按已有评分知识点取平均，仅供学习参考；评分记录较少时不形成稳定结论。
          </p>
        </Panel>
      )}

      <details className="text-ink-soft text-xs">
        <summary className="cursor-pointer">数据与版本说明</summary>
        <p className="mt-2 break-all">
          规则版本 {profile.ruleVersion} · 图谱版本{" "}
          {profile.graphVersion?.versionNumber ?? "无"} · 快照修订{" "}
          {profile.revisionNumber}。v2 起活跃度、自我反思与编程判题纳入画像，
          历史快照的口径与指纹不同，不能与 v2 直接比较。
        </p>
      </details>
    </div>
  );
}

function CoverageBar({
  stable,
  insufficient,
  unassessed,
  total,
  bordered = false,
}: {
  stable: number;
  insufficient: number;
  unassessed: number;
  total: number;
  bordered?: boolean;
}) {
  const segments = [
    { key: "stable", count: stable, className: "bg-sky-700" },
    { key: "insufficient", count: insufficient, className: "bg-sky-300" },
    { key: "unassessed", count: unassessed, className: "bg-sky-100" },
  ];
  return (
    <div
      className={
        bordered
          ? "border-b px-4 py-3"
          : "border-line mt-4 rounded-xl border px-4 py-3"
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <p className="text-ink-soft text-[11px]">整门课知识点</p>
          <p className="text-ink text-lg leading-tight font-semibold tabular-nums">
            {total}
          </p>
        </div>
        <div>
          <p className="text-ink-soft text-[11px]">记录充足</p>
          <p className="text-lg leading-tight font-semibold text-sky-800 tabular-nums">
            {stable}
            <span className="text-ink-soft ml-1 text-xs font-normal">
              {total ? Math.round((stable / total) * 100) : 0}%
            </span>
          </p>
        </div>
        <div>
          <p className="text-ink-soft text-[11px]">待积累</p>
          <p className="text-ink text-lg leading-tight font-semibold tabular-nums">
            {insufficient + unassessed}
          </p>
        </div>
      </div>
      <div
        aria-label={`评分覆盖：记录充足 ${stable} 个，记录较少 ${insufficient} 个，尚未评估 ${unassessed} 个，共 ${total} 个知识点`}
        className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-sky-50"
        role="img"
      >
        {segments.map((segment) =>
          segment.count > 0 ? (
            <span
              className={`h-full ${segment.className}`}
              key={segment.key}
              style={{ width: `${(segment.count / (total || 1)) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="text-ink-soft mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {COVERAGE_LEGEND.map((item) => (
          <span className="inline-flex items-center gap-1.5" key={item.key}>
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-sm ${item.className}`}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChapterRow({
  chapter,
  concepts,
  average,
  stable,
  insufficient,
  unassessed,
  focusConceptId,
  evidenceHref,
}: {
  chapter: { id: string; name: string; conceptIds: string[] };
  concepts: Profile["concepts"];
  average: number | null;
  stable: number;
  insufficient: number;
  unassessed: number;
  focusConceptId?: string;
  evidenceHref?: string;
}) {
  return (
    <details
      id={`profile-chapter-${chapter.id}`}
      open={
        focusConceptId ? chapter.conceptIds.includes(focusConceptId) : undefined
      }
      className="group"
    >
      <summary className="hover:bg-muted/40 flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <h3
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={chapter.name}
        >
          {chapter.name}
        </h3>
        <div
          className="flex h-2.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-sky-50 sm:max-w-[220px]"
          role="img"
          aria-label={`${chapter.name}评分记录：记录充足 ${stable} 个，记录较少 ${insufficient} 个，尚未评估 ${unassessed} 个，共 ${concepts.length} 个知识点`}
        >
          {concepts.length > 0 ? (
            <>
              {stable > 0 ? (
                <span
                  className="h-full bg-sky-700"
                  style={{ width: `${(stable / concepts.length) * 100}%` }}
                />
              ) : null}
              {insufficient > 0 ? (
                <span
                  className="h-full bg-sky-300"
                  style={{
                    width: `${(insufficient / concepts.length) * 100}%`,
                  }}
                />
              ) : null}
              {unassessed > 0 ? (
                <span
                  className="h-full bg-sky-100"
                  style={{ width: `${(unassessed / concepts.length) * 100}%` }}
                />
              ) : null}
            </>
          ) : null}
        </div>
        <span className="text-ink-soft w-24 shrink-0 text-right text-xs tabular-nums">
          {average === null ? "尚未评估" : `熟练度 ${average}%`}
        </span>
        <span
          aria-hidden="true"
          className="text-ink-soft size-4 shrink-0 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="border-t bg-slate-50/40 px-4">
        {concepts.length ? (
          <div className="divide-y">
            {concepts.map((concept) => (
              <div
                key={concept.conceptId}
                id={`profile-concept-${concept.conceptId}`}
                tabIndex={focusConceptId === concept.conceptId ? -1 : undefined}
                className="scroll-mt-24 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-medium">{concept.name}</h4>
                  <span className="text-sm font-semibold text-sky-800">
                    {concept.masteryScore === null
                      ? "尚未评估"
                      : `${concept.masteryScore}%`}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-50">
                  <div
                    className="h-full rounded-full bg-sky-600"
                    style={{ width: `${concept.masteryScore ?? 0}%` }}
                  />
                </div>
                <p className="text-ink-soft mt-2 text-xs">
                  {evidenceLabels[concept.evidenceState]} ·{" "}
                  {concept.evidenceCount} 条评分记录 · 结论可靠度{" "}
                  {Math.round(concept.confidence * 100)}%
                </p>
                {concept.historicalEvidence.latestReferences.length ? (
                  <details
                    open={focusConceptId === concept.conceptId || undefined}
                    className="mt-2 text-sm"
                  >
                    <summary className="cursor-pointer text-sky-700">
                      查看评分依据
                    </summary>
                    <div className="mt-3 space-y-2">
                      {concept.historicalEvidence.latestReferences.map(
                        (item) => (
                          <div
                            key={item.evidenceId}
                            className="rounded-lg bg-sky-50/60 p-3"
                          >
                            <div className="flex flex-wrap justify-between gap-2">
                              <span className="font-medium">
                                {item.assignmentName} · {item.questionName}
                              </span>
                              <span>
                                {item.score}/{item.maxScore} 分
                              </span>
                            </div>
                            <p className="text-ink-soft mt-1 text-xs">
                              {item.gradedAt.toLocaleString("zh-CN")} · 评分修订{" "}
                              {item.revision} · 图谱版本{" "}
                              {item.sourceGraphVersionNumber ?? "历史版本"}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </details>
                ) : evidenceHref && concept.evidenceCount > 0 ? (
                  <a
                    className="text-brand-strong mt-2 inline-flex min-h-10 items-center rounded-sm text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
                    href={`${evidenceHref}&conceptId=${encodeURIComponent(concept.conceptId)}#profile-concept-${encodeURIComponent(concept.conceptId)}`}
                  >
                    查看评分依据
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ink-soft py-4 text-sm">本章暂无知识点记录。</p>
        )}
      </div>
    </details>
  );
}

function DimensionCard({
  label,
  state,
  headline,
  unit,
  detail,
  action,
  tone = "default",
}: {
  label: string;
  state?: LearnerProfileEvidenceState;
  headline: string;
  unit?: string;
  detail: string;
  action?: ReactNode;
  tone?: "default" | "subjective";
}) {
  return (
    <div
      className={`min-w-0 rounded-lg border p-4 ${
        tone === "subjective"
          ? "border-amber-200 bg-amber-50/50"
          : "border-line bg-muted/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink-soft text-xs">{label}</p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
            evidenceStyles[state ?? "NO_EVIDENCE"]
          }`}
        >
          {state ? evidenceLabels[state] : "暂无记录"}
        </span>
      </div>
      <p className="text-ink mt-2 flex items-baseline gap-1 text-[20px] leading-none font-semibold tabular-nums">
        {headline}
        {unit ? (
          <span className="text-ink-soft text-xs font-medium">{unit}</span>
        ) : null}
      </p>
      <p className="text-ink-soft mt-2 text-xs leading-5">{detail}</p>
      {action}
      {tone === "subjective" ? (
        <p className="mt-1 text-[11px] text-amber-700">
          学生自述，不参与客观掌握度
        </p>
      ) : null}
    </div>
  );
}
