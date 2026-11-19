import { Target } from "lucide-react";
import Link from "next/link";

import { MetricTile, Panel, SectionHeading } from "@/components/ui/panel";
import type { StudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";

const quietLink =
  "inline-flex min-h-10 items-center gap-1 rounded-md border border-line bg-card px-2.5 text-xs font-medium text-ink-body hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

/**
 * 学生端「按目标」视图：同一份掌握度按课程目标重新聚合。
 * 只做展示与排序，不参与达成度计算；自动推断的关联会标注出来。
 */
export function ObjectiveMasteryGrid({
  objectives,
  courseId,
  classroomId,
  readOnly,
}: {
  objectives: StudentCourseLearningCenter["objectives"];
  courseId: string;
  classroomId: string;
  readOnly: boolean;
}) {
  if (!objectives.length) {
    return (
      <Panel>
        <SectionHeading
          description="教师把知识点关联到课程目标后，这里会按「这个目标我达成得怎么样」重新汇总掌握度。"
          icon={<Target aria-hidden="true" className="text-ink-soft size-5" />}
          title="按课程目标查看"
        />
        <p className="text-ink-soft mt-3 rounded-xl border border-dashed p-6 text-center text-sm">
          当前还没有可用的目标映射。你仍可以在「按章节」里查看每个知识点的掌握情况。
        </p>
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <p className="text-ink-soft text-sm xl:col-span-2">
        同一知识点可服务多个目标。覆盖范围和已掌握情况分别统计。
      </p>
      {objectives.map((objective) => (
        <Panel key={objective.code}>
          <SectionHeading
            description={objective.description || undefined}
            title={
              <span>
                <span className="text-ink-soft mr-2 font-mono text-sm">
                  {objective.code}
                </span>
                {objective.title}
              </span>
            }
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <MetricTile
              detail={`占全课程 ${objective.coverageRatio}%`}
              label="覆盖知识点"
              value={objective.conceptCount}
            />
            <MetricTile
              detail={
                objective.needsSupportCount > 0
                  ? "掌握度低于 60%，建议优先补练"
                  : "暂无需要加强的知识点"
              }
              label="需加强"
              tone={objective.needsSupportCount > 0 ? "muted" : "default"}
              value={objective.needsSupportCount}
            />
            <MetricTile
              detail={
                objective.noEvidenceCount > 0
                  ? "还没有评分记录"
                  : "所有知识点都有评分记录"
              }
              label="待评估"
              tone={objective.noEvidenceCount > 0 ? "muted" : "default"}
              value={objective.noEvidenceCount}
            />
          </div>
          <p className="text-ink-soft mt-3 text-xs">
            {objective.conclusiveCount > 0
              ? `证据充分的 ${objective.conclusiveCount} 个知识点中，已掌握 ${objective.masteredCount} 个。`
              : "暂无证据充分的知识点。"}
          </p>
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-ink-soft">目标平均掌握度</span>
              <span className="text-ink font-medium tabular-nums">
                {objective.masteryAverage === null
                  ? "未评估"
                  : `${objective.masteryAverage}%`}
              </span>
            </div>
            <div
              aria-label={`${objective.title}目标平均掌握度：${
                objective.masteryAverage === null
                  ? "未评估"
                  : `${objective.masteryAverage}%`
              }`}
              className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
              role="img"
            >
              <div
                className={`h-full rounded-full ${
                  objective.masteryAverage === null
                    ? "bg-slate-300"
                    : objective.masteryAverage >= 80
                      ? "bg-emerald-500"
                      : objective.masteryAverage >= 60
                        ? "bg-amber-400"
                        : "bg-rose-500"
                }`}
                style={{ width: `${objective.masteryAverage ?? 0}%` }}
              />
            </div>
          </div>
          {objective.focusConcepts.length ? (
            <div className="mt-3">
              <p className="text-ink-soft text-xs">
                这个目标下最需要补的知识点
              </p>
              <ul className="mt-1.5 divide-y">
                {objective.focusConcepts.map((concept) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                    key={concept.conceptId ?? concept.code}
                  >
                    <span className="min-w-0 text-sm">
                      <span className="text-ink-soft mr-1.5 text-xs">
                        {concept.code}
                      </span>
                      <span className="[overflow-wrap:anywhere]">
                        {concept.name}
                      </span>
                    </span>
                    {!readOnly && concept.conceptId ? (
                      <Link
                        className={quietLink}
                        href={`/student/recommendations?view=generate&courseId=${encodeURIComponent(courseId)}&classroomId=${encodeURIComponent(classroomId)}&conceptId=${encodeURIComponent(concept.conceptId)}`}
                      >
                        去练这个知识点
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-ink-soft mt-3 rounded-md border border-dashed p-2.5 text-xs">
              该目标下的知识点都已掌握，可以继续学习其他内容。
            </p>
          )}
          <p className="text-ink-soft mt-3 text-xs leading-5">
            {objective.coverageRatio >= 60
              ? `该目标关联了 ${objective.coverageRatio}% 的课程知识点，结论会接近课程整体水平。`
              : null}
            {objective.confirmedRatio === 100
              ? " 关联均已由教师确认。"
              : ` 含自动推断的关联（教师已确认 ${objective.confirmedRatio}%），仅用于展示与排序。`}
            {readOnly ? " 当前教学班已结课，只能查看记录。" : ""}
          </p>
        </Panel>
      ))}
    </div>
  );
}
