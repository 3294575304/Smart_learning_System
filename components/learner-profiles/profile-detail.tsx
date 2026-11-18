import type { LearnerProfileEvidenceState } from "@prisma/client";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Panel, SectionHeading } from "@/components/ui/panel";
import type { getStudentLearnerProfile } from "@/services/learner-profiles/service";
import { DIMENSION_REGISTRY } from "@/services/learner-profiles/dimension-registry";

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

const LEGEND = [
  { key: "stable", label: "记录充足", color: "#10b981" },
  { key: "insufficient", label: "评分记录较少", color: "#fbbf24" },
  { key: "unassessed", label: "尚未评估", color: "#cbd5e1" },
] as const;

export function LearnerProfileDetail({
  profile,
  focusConceptId,
  studentView = false,
  reflectionHref,
  evidenceHref,
}: {
  profile: Profile;
  focusConceptId?: string;
  studentView?: boolean;
  /** 学生端：跳转到自主练习里的自我反思面板。 */
  reflectionHref?: string;
  evidenceHref?: string;
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
  const overallSegments = [
    { key: "stable", count: courseStable, color: "#10b981" },
    { key: "insufficient", count: courseInsufficient, color: "#fbbf24" },
    { key: "unassessed", count: courseUnassessed, color: "#cbd5e1" },
  ].map((segment) => ({
    ...segment,
    width: courseTotal
      ? Math.round((segment.count / courseTotal) * 1000) / 10
      : 0,
  }));
  const overallAriaLabel = `整门课评分覆盖：记录充足 ${courseStable} 个，待积累 ${courseInsufficient} 个，尚未评估 ${courseUnassessed} 个，共 ${courseTotal} 个知识点`;

  return (
    <div className="space-y-6">
      <Panel>
        <SectionHeading
          actions={
            <div className="text-ink-soft text-right text-xs">
              <p>快照修订 #{profile.revisionNumber}</p>
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
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {DIMENSION_REGISTRY.map((definition) => {
            const card = definition.build(
              dimensions[definition.key],
              Boolean(studentView),
            );
            return (
              <DimensionCard
                action={
                  card.action === "reflection" && reflectionHref ? (
                    <Link
                      className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs font-medium text-amber-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
                      href={reflectionHref}
                    >
                      {card.actionLabel}
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  ) : undefined
                }
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
        <p className="text-ink-soft mt-3 text-xs leading-5">
          知识点掌握度按已公布评分记录的累计得分与满分计算，再汇总评分记录达到评估要求的概念。
          活跃度只统计作业/练习的评分事件，不代表努力程度；自我反思是学生自述，两者都不参与客观掌握度与课程总评。
        </p>
        <p className="text-ink-soft mt-2 text-xs leading-5">
          画像口径 {profile.ruleVersion}：本版接入活跃度、自我反思与编程判题，
          与历史版本不可直接对比。
        </p>
      </Panel>

      <Panel>
        <SectionHeading
          description="章节熟练度根据已有评分记录计算。展开章节可查看每个知识点的状态和评分依据，未评估的知识点不按零分计。"
          level="page"
          title="章节熟练度与评估覆盖"
        />
        {profile.chapters.length > 0 ? (
          <div className="border-line mt-4 rounded-xl border">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-3">
              <div className="min-w-[180px]">
                <p className="text-ink-soft text-[11px]">整门课知识点</p>
                <p className="text-ink text-lg leading-tight font-semibold tabular-nums">
                  {courseTotal}
                </p>
              </div>
              <div className="min-w-[180px]">
                <p className="text-ink-soft text-[11px]">记录充足</p>
                <p className="text-lg leading-tight font-semibold tabular-nums">
                  <span className="text-emerald-700">{courseStable}</span>
                  <span className="text-ink-soft ml-1 text-xs font-normal">
                    {courseTotal
                      ? Math.round((courseStable / courseTotal) * 100)
                      : 0}
                    %
                  </span>
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="flex h-2.5 overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={overallAriaLabel}
                >
                  {overallSegments.map((segment) =>
                    segment.width > 0 ? (
                      <span
                        key={segment.key}
                        className="h-full"
                        style={{
                          width: `${segment.width}%`,
                          background: segment.color,
                        }}
                      />
                    ) : null,
                  )}
                </div>
                <div className="text-ink-soft mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                  {LEGEND.map((item) => (
                    <span
                      className="inline-flex items-center gap-1.5"
                      key={item.key}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-sm"
                        style={{ background: item.color }}
                      />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
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

      <details className="text-ink-soft text-xs">
        <summary className="cursor-pointer">查看画像版本信息</summary>
        <p className="mt-2 break-all">
          规则版本 {profile.ruleVersion} · 图谱版本{" "}
          {profile.graphVersion?.versionNumber ?? "无"} · 快照修订{" "}
          {profile.revisionNumber}
          。v2 起活跃度、自我反思与编程判题纳入画像，
          历史快照的口径与指纹不同，不能与 v2 直接比较。
        </p>
      </details>
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
          className="flex h-2.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-slate-100 sm:max-w-[220px]"
          role="img"
          aria-label={`${chapter.name}评分记录：记录充足 ${stable} 个，记录较少 ${insufficient} 个，尚未评估 ${unassessed} 个，共 ${concepts.length} 个知识点`}
        >
          {concepts.length > 0 ? (
            <>
              {stable > 0 ? (
                <span
                  className="h-full bg-emerald-500"
                  style={{ width: `${(stable / concepts.length) * 100}%` }}
                />
              ) : null}
              {insufficient > 0 ? (
                <span
                  className="h-full bg-amber-400"
                  style={{
                    width: `${(insufficient / concepts.length) * 100}%`,
                  }}
                />
              ) : null}
              {unassessed > 0 ? (
                <span
                  className="h-full bg-slate-300"
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
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${concept.masteryScore ?? 0}%` }}
                  />
                </div>
                <p className="text-ink-soft mt-2 text-xs">
                  {evidenceLabels[concept.evidenceState]} ·{" "}
                  {concept.evidenceCount} 条评分记录 · 置信度{" "}
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
