import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  GitBranch,
  Route,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { TrendChart } from "@/components/dashboard/trend-chart";
import { Panel, SectionHeading } from "@/components/ui/panel";
import { knowledgeStateDot } from "@/components/ui/knowledge-state";
import { CONCLUSIVE_EVIDENCE_COUNT } from "@/services/learner-profiles/constants";
import type { StudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";

/** 评分记录较少时给出还差多少，而不是只写「未评估」。 */
function evidenceHint(count: number) {
  if (count === 0) return "还没有评分记录";
  if (count < CONCLUSIVE_EVIDENCE_COUNT) {
    return `还差 ${CONCLUSIVE_EVIDENCE_COUNT - count} 条评分记录可评估`;
  }
  return `${count} 条评分记录`;
}

type ConceptStatus =
  StudentCourseLearningCenter["heatmap"][number]["concepts"][number]["status"];

const statusPresentation: Record<
  ConceptStatus,
  { label: string; className: string; dotClassName: string }
> = {
  MASTERED: {
    label: "已掌握",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dotClassName: "bg-emerald-500",
  },
  DEVELOPING: {
    label: "巩固中",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    dotClassName: "bg-amber-500",
  },
  NEEDS_SUPPORT: {
    label: "需加强",
    className: "border-red-200 bg-red-50 text-red-800",
    dotClassName: "bg-red-500",
  },
  INSUFFICIENT: {
    label: "待进一步评估",
    className: "border-blue-200 bg-blue-50 text-blue-800",
    dotClassName: "bg-blue-500",
  },
  NO_EVIDENCE: {
    label: "尚未评估",
    className: "border-sky-100 bg-sky-50/70 text-gray-600",
    dotClassName: "bg-gray-300",
  },
};

export function StudentCourseLearningCenterView({
  data,
  tab = "path",
  scoreTrend = true,
  readOnly = false,
}: {
  data: StudentCourseLearningCenter;
  tab?: "path" | "activity";
  /**
   * 是否渲染「近期评分得分率」。课程学习中心的趋势页已经有 ScoreChart 画作业成绩，
   * 两张图讲的是同一件事（按次得分率），并排只会让人对不上刻度。
   */
  scoreTrend?: boolean;
  /** 结课/关闭班级：隐藏练习入口，只保留查看。 */
  readOnly?: boolean;
}) {
  const chaptersByPoint = new Map(
    data.heatmap.flatMap(({ key, name, concepts }) =>
      concepts.map((concept) => [concept.key, { key, name }] as const),
    ),
  );
  const focusItem =
    data.learningPath.current.find((item) => item.conceptId) ?? null;
  const focusHref =
    !readOnly && focusItem?.conceptId
      ? `/student/recommendations?${new URLSearchParams({
          view: "generate",
          courseId: data.course.id,
          ...(data.classroom ? { classroomId: data.classroom.id } : {}),
          conceptId: focusItem.conceptId,
        }).toString()}`
      : null;
  const masteryPoints = data.masteryTrend;
  const masteryDelta =
    masteryPoints.length >= 2
      ? Number(
          (
            masteryPoints[masteryPoints.length - 1].value -
            masteryPoints[masteryPoints.length - 2].value
          ).toFixed(1),
        )
      : null;
  return (
    <div className="space-y-6">
      {tab === "path" && (
        <Panel className="scroll-mt-24" id="learning-path">
          <SectionHeading
            actions={
              focusHref ? (
                <Link
                  className="bg-brand hover:bg-brand-strong inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                  href={focusHref}
                >
                  练习{focusItem?.name}
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                </Link>
              ) : undefined
            }
            description="先看需要巩固的内容，也可以查看已掌握和尚无评分记录的知识点。"
            icon={<Route aria-hidden="true" className="text-ink-soft size-5" />}
            level="page"
            title="我的学习路径"
          />
          <div className="mt-5 grid items-start gap-4 lg:grid-cols-3">
            <PathColumn
              empty={
                data.overview.evidenceConcepts === 0
                  ? "先完成几道作业或练习题，看看掌握得怎么样。"
                  : "有评分记录的知识点都已掌握，可以继续学习其他内容。"
              }
              icon={TriangleAlert}
              items={data.learningPath.current}
              chaptersByPoint={chaptersByPoint}
              readOnly={readOnly}
              scope={{
                courseId: data.course.id,
                classroomId: data.classroom?.id ?? null,
              }}
              previewCount={3}
              title="优先巩固"
            />
            <PathColumn
              empty="完成相关题目并拿到评分后，就能看到哪些内容已经掌握。"
              icon={CheckCircle2}
              items={data.learningPath.mastered}
              chaptersByPoint={chaptersByPoint}
              readOnly={readOnly}
              scope={{
                courseId: data.course.id,
                classroomId: data.classroom?.id ?? null,
              }}
              previewCount={0}
              title="已掌握"
            />
            <PathColumn
              empty={
                data.overview.totalConcepts
                  ? "所有知识点已有评分记录。"
                  : "等待教师发布课程知识图谱。"
              }
              icon={GitBranch}
              items={data.learningPath.next}
              chaptersByPoint={chaptersByPoint}
              readOnly={readOnly}
              scope={{
                courseId: data.course.id,
                classroomId: data.classroom?.id ?? null,
              }}
              previewCount={0}
              title="尚无评分记录"
            />
          </div>
        </Panel>
      )}
      {tab === "activity" && (
        <>
          <section className="scroll-mt-24 space-y-4" id="learning-trend">
            <div>
              <h2 className="text-ink text-[15px] font-semibold">
                我的学习趋势
              </h2>
              <p className="text-ink-soft mt-1 text-sm">
                {scoreTrend
                  ? "掌握度只采用评分记录达到评估要求的画像；得分率按已发布作业、已完成整组练习展示，二者取样不同。"
                  : "掌握度只采用评分记录达到评估要求的画像，未评估不等于零分；得分率见上方「我的作业成绩」。"}
              </p>
              {scoreTrend &&
              data.accuracyTrend.length > 0 &&
              data.accuracyTrend.length < 3 ? (
                <p className="mt-1 text-xs text-amber-700">
                  目前只有 {data.accuracyTrend.length}{" "}
                  次成绩，趋势仅供参考，累积到 3 次后更稳定。
                </p>
              ) : null}
            </div>
            <div className={`grid gap-6 ${scoreTrend ? "xl:grid-cols-2" : ""}`}>
              <TrendPanel
                description="课程汇总：仅统计评分记录充足知识点，未评估不等于零分。"
                caption="课程汇总 · 各版本只统计当时评分记录充足的知识点，覆盖范围可能变化；展开查看版本和更新时间。"
                emptyMessage="当前还没有足够的历史画像生成趋势。"
                delta={masteryDelta}
                label="课程稳定掌握度变化"
                points={data.masteryTrend}
                title="稳定掌握度变化"
              />
              {scoreTrend && (
                <TrendPanel
                  description="每根柱代表一份已发布作业或一组全部判完的练习；不会把同次作答拆成多根柱。"
                  caption="按作答时间排列，最多展示最近 8 组；待发布、未完成及待判题不按零分计算。"
                  emptyMessage="当前还没有已发布的作业成绩或全部完成的练习。"
                  label="近期评分得分率变化"
                  points={data.accuracyTrend}
                  title="近期评分得分率"
                />
              )}
            </div>
          </section>

          <section
            className="grid scroll-mt-24 gap-6 xl:grid-cols-[1fr_0.8fr]"
            id="learning-records"
          >
            <Panel>
              <div className="flex items-center gap-2">
                <Clock3 aria-hidden="true" className="text-ink-soft size-5" />
                <h2 className="text-ink text-[15px] font-semibold">
                  我的学习记录
                </h2>
              </div>
              {data.recentActivity.length ? (
                <ol className="mt-4 divide-y">
                  {data.recentActivity.map((activity) => (
                    <li
                      className="flex items-start gap-3 py-3 first:pt-0"
                      key={activity.id}
                    >
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{activity.label}</p>
                        <p className="text-ink-soft mt-1 text-xs">
                          涉及 {activity.conceptCount} 个知识点
                        </p>
                      </div>
                      <time className="text-ink-soft shrink-0 text-xs">
                        {activity.occurredAt.toLocaleString("zh-CN")}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-ink-soft mt-4 rounded-xl border border-dashed p-8 text-center text-sm">
                  暂无作业或练习评分记录。
                </p>
              )}
            </Panel>
            <Panel>
              <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100/70">
                <Sparkles aria-hidden="true" className="text-ink-body size-5" />
              </div>
              <h2 className="text-ink mt-4 text-[15px] font-semibold">
                画像说明
              </h2>
              <p className="text-ink-soft mt-2 text-sm leading-7">
                {data.summary}
              </p>
              <p className="text-ink-soft mt-4 border-t pt-4 text-xs leading-5">
                更新时间：{data.generatedAt.toLocaleString("zh-CN")}
                。出勤、自我反思与知识掌握分别计算，不会相互覆盖。
              </p>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

function PathColumn({
  title,
  previewCount,
  chaptersByPoint,
  empty,
  items,
  readOnly,
  scope,
  icon: Icon,
}: {
  title: string;
  previewCount: number;
  chaptersByPoint: ReadonlyMap<string, { key: string; name: string }>;
  empty: string;
  readOnly: boolean;
  scope: { courseId: string; classroomId: string | null };
  items: Array<{
    key: string;
    conceptId: string | null;
    code: string;
    name: string;
    masteryScore: number | null;
    evidenceCount: number;
    status: ConceptStatus;
    prerequisiteGaps?: string[];
  }>;
  icon: typeof CheckCircle2;
}) {
  function renderItem(item: (typeof items)[number], index: number) {
    const practiceHref =
      !readOnly && item.conceptId
        ? `/student/recommendations?${new URLSearchParams({
            view: "generate",
            courseId: scope.courseId,
            ...(scope.classroomId ? { classroomId: scope.classroomId } : {}),
            conceptId: item.conceptId,
          })}`
        : null;
    return (
      <li className="flex min-w-0 items-start gap-2 py-3" key={item.key}>
        {previewCount > 0 && (
          <span className="text-ink-soft shrink-0 text-xs tabular-nums">
            {index + 1}.
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-ink flex items-center gap-2 text-sm font-medium [overflow-wrap:anywhere]">
            <span
              aria-hidden="true"
              className={`size-2.5 shrink-0 ${knowledgeStateDot[item.status]}`}
            />
            {item.name}
          </p>
          <p className="text-ink-soft mt-1 text-xs">
            {statusPresentation[item.status].label} ·{" "}
            {evidenceHint(item.evidenceCount)}
            {item.masteryScore !== null &&
            item.status !== "INSUFFICIENT" &&
            item.status !== "NO_EVIDENCE"
              ? ` · ${item.masteryScore}%`
              : ""}
          </p>
          {item.prerequisiteGaps?.length ? (
            <p className="mt-1 text-xs text-amber-800">
              先补：{item.prerequisiteGaps.join("、")}
            </p>
          ) : null}
        </div>
        {practiceHref && (
          <Link
            className="text-brand-strong border-line hover:bg-muted inline-flex min-h-9 shrink-0 items-center rounded-md border px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label={`练习${item.name}`}
            href={practiceHref}
          >
            练习
          </Link>
        )}
      </li>
    );
  }
  const groups = new Map<
    string | null,
    {
      name: string;
      rows: Array<{ item: (typeof items)[number]; index: number }>;
    }
  >();
  items.slice(previewCount).forEach((item, offset) => {
    const chapter = chaptersByPoint.get(item.key);
    const key = chapter?.key ?? null;
    const group = groups.get(key) ?? {
      name: chapter?.name ?? "未分章知识点",
      rows: [],
    };
    group.rows.push({ item, index: previewCount + offset });
    groups.set(key, group);
  });
  return (
    <article className="border-line min-w-0 overflow-hidden rounded-xl border">
      <header className="flex items-center justify-between border-b bg-sky-50/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" className="text-ink-soft size-4" />
          <h3 className="text-sm font-medium">{title}</h3>
          <span className="text-ink-soft rounded-full bg-white/70 px-2 py-0.5 text-[11px] tabular-nums">
            {items.length}
          </span>
        </div>
      </header>
      {items.length ? (
        <>
          {previewCount > 0 && items.length > previewCount && (
            <p className="text-ink-soft px-4 pt-3 text-xs">
              先看最需要巩固的 {previewCount} 个知识点
            </p>
          )}
          {previewCount > 0 && (
            <ol className="divide-y px-4">
              {items.slice(0, previewCount).map(renderItem)}
            </ol>
          )}
          {items.length > previewCount && (
            <details className="border-line border-t px-4 open:pb-3">
              <summary className="text-brand-strong cursor-pointer py-3 text-sm font-medium">
                查看{previewCount ? "其余" : "全部"}{" "}
                {items.length - previewCount} 个知识点
              </summary>
              <div
                role="region"
                aria-label={`${title}章节列表`}
                tabIndex={0}
                className="border-line focus-visible:outline-brand mt-1 max-h-[min(22rem,55dvh)] min-w-0 [scrollbar-gutter:stable] overflow-y-auto overscroll-y-contain rounded-md border px-3 pb-1 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {[...groups].map(([key, { name, rows }]) => (
                  <section key={key ?? "__unassigned"}>
                    <h4 className="bg-muted text-ink sticky top-0 z-[1] flex items-center justify-between gap-2 rounded-b-md px-2 py-2 text-xs font-semibold">
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {name}
                      </span>
                      <span className="text-ink-soft shrink-0 font-normal tabular-nums">
                        {rows.length} 个
                      </span>
                    </h4>
                    <ul className="divide-y">
                      {rows.map(({ item, index }) => renderItem(item, index))}
                    </ul>
                  </section>
                ))}
              </div>
            </details>
          )}
        </>
      ) : (
        <p className="text-ink-soft p-4 text-sm leading-6">{empty}</p>
      )}
    </article>
  );
}

function TrendPanel({
  title,
  description,
  label,
  emptyMessage,
  points,
  caption,
  delta,
}: {
  caption?: string;
  delta?: number | null;
  title: string;
  description: string;
  label: string;
  emptyMessage: string;
  points: StudentCourseLearningCenter["masteryTrend"];
}) {
  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-ink text-[15px] font-semibold">{title}</h3>
        {typeof delta === "number" && delta !== 0 ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
              delta > 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            较上一版 {delta > 0 ? "+" : ""}
            {delta}pt
          </span>
        ) : null}
      </div>
      <p className="text-ink-soft mt-1 text-sm">{description}</p>
      <TrendChart
        compactSmallSample
        ariaLabel={label}
        caption={caption}
        showDetails
        emptyMessage={emptyMessage}
        points={points}
      />
    </Panel>
  );
}
