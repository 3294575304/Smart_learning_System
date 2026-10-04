import type { LearnerProfileEvidenceState } from "@prisma/client";

import type { getStudentLearnerProfile } from "@/services/learner-profiles/service";

type Profile = Awaited<ReturnType<typeof getStudentLearnerProfile>>;

const evidenceLabels: Record<LearnerProfileEvidenceState, string> = {
  NO_EVIDENCE: "尚未评估",
  INSUFFICIENT_EVIDENCE: "待进一步评估",
  CONCLUSIVE: "已评估",
};

interface Dimension {
  evidenceState?: LearnerProfileEvidenceState;
  evidenceCount?: number;
  rate?: number | null;
  conclusiveAverageMastery?: number | null;
  conclusiveConceptCount?: number;
  sourceStatus?: string;
}

export function LearnerProfileDetail({ profile }: { profile: Profile }) {
  const attendance = profile.dimensions.attendance as Dimension;
  const activity = profile.dimensions.activity as Dimension;
  const reflection = profile.dimensions.reflection as Dimension;
  const mastery = profile.dimensions.objectiveMastery as Dimension;
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">确定性画像摘要</h2>
            <p className="mt-2 text-sm leading-6">{profile.summary}</p>
          </div>
          <div className="text-muted-foreground text-right text-xs">
            <p>快照修订 #{profile.revisionNumber}</p>
            <p className="mt-1">
              {profile.generatedAt.toLocaleString("zh-CN")}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DimensionCard
            detail={
              attendance.rate === null || attendance.rate === undefined
                ? "暂无有效出勤记录"
                : `出勤折算率 ${attendance.rate}%`
            }
            label="出勤"
            state={attendance.evidenceState}
          />
          <DimensionCard
            detail={
              activity.sourceStatus === "NOT_COLLECTED"
                ? "尚未接入画像计算，不代表没有学习活动"
                : "—"
            }
            label="活跃度"
            state={activity.evidenceState}
          />
          <DimensionCard
            detail={
              reflection.sourceStatus === "NOT_COLLECTED"
                ? "尚未接入画像计算；已保存反思仍独立保留"
                : "—"
            }
            label="自我反思"
            state={reflection.evidenceState}
          />
          <DimensionCard
            detail={
              mastery.conclusiveAverageMastery === null ||
              mastery.conclusiveAverageMastery === undefined
                ? "暂无稳定结论"
                : `稳定概念均分 ${mastery.conclusiveAverageMastery}%`
            }
            label="客观掌握度"
            state={mastery.evidenceState}
          />
        </div>
      </section>

      <figure
        className="rounded-xl border bg-white p-5"
        aria-label="各章节熟练度与评估覆盖图"
      >
        <figcaption className="font-semibold">章节熟练度与评估覆盖</figcaption>
        <p className="mt-1 text-sm text-slate-500">
          熟练度取本章已有评分知识点的平均值，仅作参考；下方覆盖条按本章知识点总数展示证据状态。未评估不计为零分。
        </p>
        <div
          className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600"
          aria-label="评估覆盖图例"
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm bg-sky-500"
              aria-hidden="true"
            />
            证据充分
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm bg-amber-400"
              aria-hidden="true"
            />
            证据待积累
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm bg-slate-300"
              aria-hidden="true"
            />
            尚未评估
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {profile.chapters.map((chapter) => {
            const points = profile.concepts.filter((point) =>
              chapter.conceptIds.includes(point.conceptId),
            );
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
              <div
                key={chapter.id}
                className="rounded-lg border border-slate-100 p-3"
              >
                <div className="grid min-w-0 items-center gap-3 sm:grid-cols-[minmax(140px,200px)_minmax(0,1fr)_auto]">
                  <span
                    className="truncate text-sm font-medium"
                    title={chapter.name}
                  >
                    {chapter.name}
                  </span>
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>参考熟练度</span>
                      <strong className="text-sm text-slate-800">
                        {average === null ? "未评估" : `${average}%`}
                      </strong>
                    </div>
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                      role="img"
                      aria-label={`${chapter.name}参考熟练度：${average === null ? "未评估" : `${average}%`}`}
                    >
                      {average !== null ? (
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${average}%` }}
                        />
                      ) : null}
                    </div>
                  </div>
                  <a
                    className="text-sm font-medium text-sky-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"
                    href={`#profile-chapter-${chapter.id}`}
                  >
                    查看评分依据 ↓
                  </a>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>证据覆盖</span>
                    <span>
                      有证据 {stable + insufficient}/{points.length} · 充分{" "}
                      {stable} · 待积累 {insufficient} · 未评估 {unassessed}
                    </span>
                  </div>
                  <div
                    className="flex h-2.5 overflow-hidden rounded-full bg-slate-100"
                    role="img"
                    aria-label={`${chapter.name}证据覆盖：证据充分 ${stable} 个，待积累 ${insufficient} 个，尚未评估 ${unassessed} 个，共 ${points.length} 个知识点`}
                  >
                    {points.length > 0 ? (
                      <>
                        <span
                          className="h-full bg-sky-500"
                          style={{
                            width: `${(stable / points.length) * 100}%`,
                          }}
                        />
                        <span
                          className="h-full bg-amber-400"
                          style={{
                            width: `${(insufficient / points.length) * 100}%`,
                          }}
                        />
                        <span
                          className="h-full bg-slate-300"
                          style={{
                            width: `${(unassessed / points.length) * 100}%`,
                          }}
                        />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </figure>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">章节掌握与证据</h2>
        <p className="mt-1 text-sm text-slate-500">
          按课程章节查看，展开了解各知识点熟练度。无证据不计为零分。
        </p>
        <div className="mt-5 space-y-3">
          {profile.chapters.map((chapter) => {
            const concepts = chapter.conceptIds.flatMap((id) => {
              const point = profile.concepts.find(
                (item) => item.conceptId === id,
              );
              return point ? [point] : [];
            });
            const scored = concepts.filter(
              (item) => item.masteryScore !== null,
            );
            const average = scored.length
              ? Math.round(
                  scored.reduce(
                    (sum, item) => sum + (item.masteryScore ?? 0),
                    0,
                  ) / scored.length,
                )
              : null;
            return (
              <details
                key={chapter.id}
                id={`profile-chapter-${chapter.id}`}
                className="group rounded-xl border border-sky-100"
              >
                <summary className="cursor-pointer p-4">
                  <div className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-center justify-between gap-2 align-middle">
                    <h3 className="font-medium">{chapter.name}</h3>
                    <span className="text-xs text-slate-500">
                      有评分 {scored.length}/{concepts.length} ·{" "}
                      {average === null ? "尚未评估" : `参考熟练度 ${average}%`}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${chapter.name}参考熟练度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={average ?? undefined}
                    aria-valuetext={
                      average === null ? "尚未评估" : `${average}%`
                    }
                    className="mt-3 h-2 overflow-hidden rounded-full bg-sky-100/60"
                  >
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${average ?? 0}%` }}
                    />
                  </div>
                </summary>
                <div className="divide-y border-t border-sky-100 px-4">
                  {concepts.map((concept) => (
                    <div key={concept.conceptId} className="py-4">
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
                      <p className="mt-2 text-xs text-slate-500">
                        {evidenceLabels[concept.evidenceState]} ·{" "}
                        {concept.evidenceCount} 条评分证据 · 置信度{" "}
                        {Math.round(concept.confidence * 100)}%
                      </p>
                      {concept.historicalEvidence.latestReferences.length ? (
                        <details className="mt-2 text-sm">
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
                                      {item.assignmentName} ·{" "}
                                      {item.questionName}
                                    </span>
                                    <span>
                                      {item.score}/{item.maxScore} 分
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {item.gradedAt.toLocaleString("zh-CN")} ·
                                    评分修订 {item.revision} · 图谱版本{" "}
                                    {item.sourceGraphVersionNumber ??
                                      "历史版本"}
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
          {!profile.chapters.length && (
            <p className="py-6 text-center text-sm text-slate-500">
              暂无正式章节结构，请等待教师发布课程图谱。
            </p>
          )}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          章节熟练度按已有评分知识点取平均，仅供学习参考；证据不足时不形成稳定结论。
        </p>
      </section>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">查看画像版本信息</summary>
        <p className="mt-2 break-all">
          规则版本 {profile.ruleVersion} · 图谱版本{" "}
          {profile.graphVersion?.versionNumber ?? "无"} · 快照修订{" "}
          {profile.revisionNumber}
        </p>
      </details>
    </div>
  );
}

function DimensionCard({
  label,
  state,
  detail,
}: {
  label: string;
  state?: LearnerProfileEvidenceState;
  detail: string;
}) {
  return (
    <div className="rounded-lg bg-sky-50/60 p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-2 font-medium">
        {state ? evidenceLabels[state] : "无证据"}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </div>
  );
}
