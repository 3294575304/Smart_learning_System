import { Role } from "@prisma/client";
import { ArrowUpRight, RefreshCw, Target } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  confirmDerivedConceptObjectiveLinksAction,
  rederiveConceptObjectiveLinksAction,
  reviewConceptObjectiveLinkAction,
} from "@/app/actions/concept-objectives";
import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { MetricTile, Panel, SectionHeading } from "@/components/ui/panel";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getCourseObjectiveMap } from "@/services/learner-profiles/concept-objectives";

const quietButton =
  "inline-flex min-h-10 items-center gap-1 rounded-md border border-line bg-card px-2.5 text-xs font-medium text-ink-body hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

export default async function CourseObjectiveMapPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const parsed = courseIdSchema.safeParse((await params).courseId);
  if (!parsed.success) notFound();
  let map;
  try {
    map = await getCourseObjectiveMap(teacher.id, parsed.data, {
      deriveIfEmpty: true,
    });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const courseBase = `/teacher/courses/${parsed.data}`;
  const totalLinks = map.objectives.reduce(
    (sum, objective) => sum + objective.links.length,
    0,
  );
  const confirmedLinks = map.objectives.reduce(
    (sum, objective) => sum + objective.confirmedCount,
    0,
  );
  const derivedLinks = map.objectives.reduce(
    (sum, objective) => sum + objective.derivedCount,
    0,
  );
  return (
    <section className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            {derivedLinks > 0 ? (
              <form action={confirmDerivedConceptObjectiveLinksAction}>
                <input name="courseId" type="hidden" value={parsed.data} />
                <button
                  className="inline-flex min-h-10 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                  type="submit"
                >
                  确认全部推断（{derivedLinks}）
                </button>
              </form>
            ) : null}
            <form action={rederiveConceptObjectiveLinksAction}>
              <input name="courseId" type="hidden" value={parsed.data} />
              <button className={quietButton} type="submit">
                <RefreshCw aria-hidden="true" className="size-3.5" />
                从题库重新推断
              </button>
            </form>
            <TeacherBackLink href={courseBase}>返回课程</TeacherBackLink>
          </div>
        }
        description={`知识点与课程目标之间的映射（基于当前大纲 v${map.syllabusVersion ?? "—"}）。用于学生端「按目标」查看掌握度与排序，不参与课程目标达成度计算。`}
        title={`${map.course.name} · 知识点—目标映射`}
      />

      <Panel>
        <SectionHeading
          description="冷启动不需要手工标注：系统统计「同一知识点下的题目都服务哪些目标」。某知识点至少 2 道题服务同一目标、且占比 ≥ 50% 时生成候选；单个目标最多认领 40% 的知识点，避免一个目标吞掉全课。"
          icon={<Target aria-hidden="true" className="text-ink-soft size-5" />}
          title="映射是怎么来的"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricTile
            detail="当前正式大纲里的 objective"
            label="课程目标"
            value={map.objectives.length}
          />
          <MetricTile
            detail="知识点 × 目标"
            label="推断关联"
            value={totalLinks}
          />
          <MetricTile
            detail={
              confirmedLinks === totalLinks
                ? "已全部确认"
                : "未确认的仍标注为自动推断"
            }
            label="教师已确认"
            value={confirmedLinks}
          />
        </div>
        <p className="text-ink-soft mt-3 text-xs leading-5">
          确认只表示「这条映射合理」，不会改动题库、掌握度或成绩。忽略会删除该条候选，下次重新推断时可能再次出现。
          重新发布大纲后，自动推断会按新版本重建；教师已确认的映射会保留。
        </p>
      </Panel>

      {map.objectives.length === 0 ? (
        <Panel>
          <p className="text-ink-body text-sm">
            当前课程还没有正式大纲目标。请先在
            <Link
              className="mx-1 text-sky-700 underline-offset-4 hover:underline"
              href={`${courseBase}/syllabus`}
            >
              教学大纲
            </Link>
            中发布正式版本。
          </p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {map.objectives.map((objective) => (
            <Panel key={objective.code}>
              <SectionHeading
                actions={
                  <div className="flex flex-wrap gap-2">
                    {objective.derivedCount > 0 ? (
                      <form action={confirmDerivedConceptObjectiveLinksAction}>
                        <input
                          name="courseId"
                          type="hidden"
                          value={parsed.data}
                        />
                        <input
                          name="objectiveCode"
                          type="hidden"
                          value={objective.code}
                        />
                        <button
                          className="inline-flex min-h-10 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                          type="submit"
                        >
                          确认该目标（{objective.derivedCount}）
                        </button>
                      </form>
                    ) : null}
                    <Link
                      className={quietButton}
                      href={`/teacher/questions?courseId=${encodeURIComponent(parsed.data)}&objectiveCode=${encodeURIComponent(objective.code)}`}
                    >
                      该目标的题目
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  </div>
                }
                description={objective.description || undefined}
                level="page"
                title={
                  <span>
                    <span className="text-ink-soft mr-2 font-mono text-sm">
                      {objective.code}
                    </span>
                    {objective.title}
                  </span>
                }
              />
              <p className="text-ink-soft mt-2 text-xs">
                关联 {objective.links.length} 个知识点 · 已确认{" "}
                {objective.confirmedCount} · 自动推断 {objective.derivedCount}
              </p>
              {objective.links.length ? (
                <ul className="mt-3 divide-y">
                  {objective.links.map((link) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                      key={link.id}
                    >
                      <span className="min-w-0 text-sm">
                        <span className="text-ink-soft mr-1.5 text-xs">
                          {link.code}
                        </span>
                        <span className="[overflow-wrap:anywhere]">
                          {link.name}
                        </span>
                        <span className="text-ink-soft ml-2 text-xs">
                          {link.questionCount} 道题 · 置信度{" "}
                          {Math.round(link.confidence * 100)}%
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            link.source === "MANUAL"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {link.source === "MANUAL" ? "已确认" : "自动推断"}
                        </span>
                        {link.source === "MANUAL" ? (
                          <form action={reviewConceptObjectiveLinkAction}>
                            <input
                              name="courseId"
                              type="hidden"
                              value={parsed.data}
                            />
                            <input
                              name="linkId"
                              type="hidden"
                              value={link.id}
                            />
                            <input
                              name="intent"
                              type="hidden"
                              value="dismiss"
                            />
                            <button className={quietButton} type="submit">
                              移除
                            </button>
                          </form>
                        ) : (
                          <form action={reviewConceptObjectiveLinkAction}>
                            <input
                              name="courseId"
                              type="hidden"
                              value={parsed.data}
                            />
                            <input
                              name="linkId"
                              type="hidden"
                              value={link.id}
                            />
                            <input
                              name="intent"
                              type="hidden"
                              value="confirm"
                            />
                            <button className={quietButton} type="submit">
                              确认
                            </button>
                          </form>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-soft mt-3 text-sm">
                  还没有推断出关联知识点。可以先在题库中把题目关联到知识点与目标，再回来重新推断。
                </p>
              )}
            </Panel>
          ))}
        </div>
      )}
    </section>
  );
}
