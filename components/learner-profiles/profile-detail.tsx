import type { LearnerProfileEvidenceState } from "@prisma/client";

import type { getStudentLearnerProfile } from "@/services/learner-profiles/service";

type Profile = Awaited<ReturnType<typeof getStudentLearnerProfile>>;

const evidenceLabels: Record<LearnerProfileEvidenceState, string> = {
  NO_EVIDENCE: "无证据",
  INSUFFICIENT_EVIDENCE: "证据不足",
  CONCLUSIVE: "可形成结论",
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
                ? "当前版本尚未采集"
                : "—"
            }
            label="活跃度"
            state={activity.evidenceState}
          />
          <DimensionCard
            detail={
              reflection.sourceStatus === "NOT_COLLECTED"
                ? "当前版本尚未采集"
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

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">概念掌握与证据</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          置信度只由正式评分证据数量确定；公开样例运行不会出现在这里。
        </p>
        {profile.concepts.length === 0 ? (
          <p className="text-muted-foreground mt-5 rounded-lg border border-dashed p-8 text-center text-sm">
            当前课程没有已发布概念或正式评分证据。
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {profile.concepts.map((concept) => (
              <article
                className="rounded-lg border p-4"
                key={concept.conceptId}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{concept.name}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {concept.code}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">
                      {concept.masteryScore === null
                        ? "—"
                        : `${concept.masteryScore}%`}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {evidenceLabels[concept.evidenceState]} ·{" "}
                      {concept.evidenceCount} 条证据 · 置信度{" "}
                      {Math.round(concept.confidence * 100)}%
                    </p>
                  </div>
                </div>
                {concept.historicalEvidence.latestReferences.length ? (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      下钻原始评分证据
                    </summary>
                    <ul className="mt-3 space-y-2">
                      {concept.historicalEvidence.latestReferences.map(
                        (item) => (
                          <li
                            className="rounded bg-slate-50 p-3"
                            key={item.evidenceId}
                          >
                            {item.sourceType === "RECOMMENDATION_PRACTICE"
                              ? "推荐练习"
                              : "正式作业"}{" "}
                            作业 {item.assignmentId} · 题目{" "}
                            {item.assignmentQuestionId} · 评分修订{" "}
                            {item.revision} · {item.score}/{item.maxScore} ·
                            图谱版本来源 {item.sourceGraphVersionId} ·{" "}
                            {item.gradedAt.toLocaleString("zh-CN")}
                          </li>
                        ),
                      )}
                    </ul>
                  </details>
                ) : (
                  <p className="text-muted-foreground mt-3 text-xs">
                    没有可下钻的正式评分证据。
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="text-muted-foreground text-xs break-all">
        规则版本 {profile.ruleVersion} · 图谱版本{" "}
        {profile.graphVersion?.versionNumber ?? "无"} · 事件水位{" "}
        {profile.eventWatermark?.id ?? "无"} · 输入指纹{" "}
        {profile.inputFingerprint}
      </p>
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
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-2 font-medium">
        {state ? evidenceLabels[state] : "无证据"}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{detail}</p>
    </div>
  );
}
