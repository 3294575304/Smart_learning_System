import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Compass,
  GitBranch,
  Route,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { TrendChart } from "@/components/dashboard/trend-chart";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { StudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";

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

const sectionLinks = [
  { href: "#learning-overview", label: "学习概览" },
  { href: "#learning-path", label: "当前路径" },
  { href: "#knowledge-status", label: "知识分布" },
  { href: "#learning-trend", label: "变化趋势" },
  { href: "#learning-records", label: "学习记录" },
];

export function StudentCourseLearningCenterView({
  data,
}: {
  data: StudentCourseLearningCenter;
}) {
  return (
    <div className="space-y-6">
      <nav
        aria-label="课程学习中心页面导航"
        className="overflow-x-auto rounded-xl border bg-white p-2 shadow-sm shadow-sky-100/80"
      >
        <div className="flex min-w-max items-center gap-1">
          <span className="px-3 text-xs font-medium text-slate-400">
            页面导航
          </span>
          {sectionLinks.map((item, index) => (
            <Link
              className="group inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-sky-100/70 hover:text-slate-950"
              href={item.href}
              key={item.href}
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-sky-100/70 text-[11px] font-semibold text-slate-500 group-hover:bg-white">
                {index + 1}
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <section
        className="scroll-mt-24 overflow-hidden rounded-2xl border bg-white"
        id="learning-overview"
      >
        <header className="border-b px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.16em] text-slate-400 uppercase">
                Learning overview
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                从教学进度到掌握结果
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                四级口径逐层收窄，后一项只统计前一项范围内的数据。
              </p>
            </div>
            <span className="rounded-full bg-sky-100/70 px-3 py-1.5 text-xs text-slate-500">
              画像 #{data.profileRevision} · 图谱{" "}
              {data.graphVersion ?? "未发布"}
            </span>
          </div>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="grid gap-px bg-sky-100 sm:grid-cols-2 xl:grid-cols-4">
            {data.progressSteps.map((step, index) => (
              <article className="bg-white p-5" key={step.key}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
                    {index + 1}
                  </span>
                  <span className="text-xs text-slate-400">
                    {step.value === null ? "待积累" : `${step.value}%`}
                  </span>
                </div>
                <p className="mt-5 text-sm font-medium text-slate-600">
                  {step.label}
                </p>
                <p className="mt-1 flex items-baseline gap-1">
                  <strong className="text-3xl tracking-tight text-slate-950">
                    {step.numerator}
                  </strong>
                  <span className="text-sm text-slate-400">
                    / {step.denominator}
                  </span>
                </p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-sky-100/70">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${step.value ?? 0}%` }}
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {step.detail}
                </p>
              </article>
            ))}
          </div>

          <aside className="border-l border-sky-100 bg-gradient-to-br from-sky-50 to-emerald-50 p-5 text-slate-800 sm:p-6">
            <div className="flex size-10 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm ring-1 ring-sky-100">
              <Compass aria-hidden="true" className="size-5" />
            </div>
            <p className="mt-5 text-xs font-medium tracking-[0.16em] text-sky-700 uppercase">
              当前建议
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-700">
              {data.nextAction}
            </p>
            <div className="mt-5 grid gap-2">
              <ActionLink
                href="/student/recommendations"
                label={
                  data.overview.activeRecommendations > 0
                    ? `继续 ${data.overview.activeRecommendations} 项练习`
                    : "进入自主练习"
                }
              />
              <ActionLink
                href={`/student/courses/${data.course.id}/knowledge-graph${data.classroom ? `?classroomId=${encodeURIComponent(data.classroom.id)}` : ""}`}
                label="查看课程知识图谱"
              />
            </div>
          </aside>
        </div>

        <dl className="grid border-t bg-sky-50/60 sm:grid-cols-2 xl:grid-cols-4">
          {data.referenceIndicators.map((indicator) => (
            <div
              className="border-b p-4 last:border-b-0 sm:border-r xl:border-b-0"
              key={indicator.key}
            >
              <dt className="text-xs text-slate-500">{indicator.label}</dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <strong className="text-xl text-slate-950">
                  {indicator.value === null ? "—" : `${indicator.value}%`}
                </strong>
                <span className="truncate text-xs text-slate-400">
                  {indicator.detail}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        className="scroll-mt-24 rounded-2xl border bg-white p-5 sm:p-6"
        id="learning-path"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Route aria-hidden="true" className="size-5 text-slate-500" />
              <h2 className="text-lg font-semibold">我的学习路径</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              先处理低掌握知识点，再补足证据，最后按课程顺序预习后续内容。
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-950"
            href={`/student/courses/${data.course.id}/profile${data.classroom ? `?classroomId=${encodeURIComponent(data.classroom.id)}` : ""}`}
          >
            查看完整画像
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <PathColumn
            empty="完成带知识点的评分后，会在这里记录已掌握内容。"
            icon={CheckCircle2}
            items={data.learningPath.mastered}
            step="01"
            title="已经掌握"
          />
          <PathColumn
            empty={
              data.overview.taughtConcepts === 0
                ? "教师尚未配置已授教学进度。"
                : "当前已授知识点均已掌握。"
            }
            icon={TriangleAlert}
            items={data.learningPath.current}
            step="02"
            title="优先巩固"
          />
          <PathColumn
            empty="当前图谱中的知识点都已纳入教学进度。"
            icon={GitBranch}
            items={data.learningPath.next}
            step="03"
            title="接下来学"
          />
        </div>
      </section>

      <KnowledgeStatus data={data} />

      <section className="scroll-mt-24 space-y-4" id="learning-trend">
        <div>
          <h2 className="text-lg font-semibold">学习变化趋势</h2>
          <p className="mt-1 text-sm text-slate-500">
            掌握度只采用达到证据门槛的画像；得分率按已发布作业、已完成整组练习展示，二者取样不同。
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <TrendPanel
            description="课程汇总：仅统计证据充足知识点，未评估不等于零分。"
            caption="课程汇总 · 各版本只统计当时证据充足的知识点，覆盖范围可能变化；展开查看版本和更新时间。"
            emptyMessage="当前还没有足够的历史画像生成趋势。"
            label="课程稳定掌握度变化"
            points={data.masteryTrend}
            title="稳定掌握度变化"
          />
          <TrendPanel
            description="每根柱代表一份已发布作业或一组全部判完的练习；不会把同次作答拆成多根柱。"
            caption="按作答时间排列，最多展示最近 8 组；待发布、未完成及待判题不按零分计算。"
            emptyMessage="当前还没有已发布的作业成绩或全部完成的练习。"
            label="近期评分得分率变化"
            points={data.accuracyTrend}
            title="近期评分得分率"
          />
        </div>
      </section>

      <section
        className="grid scroll-mt-24 gap-6 xl:grid-cols-[1fr_0.8fr]"
        id="learning-records"
      >
        <div className="rounded-2xl border bg-white p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Clock3 aria-hidden="true" className="size-5 text-slate-500" />
            <h2 className="text-lg font-semibold">近期学习记录</h2>
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
                    <p className="mt-1 text-xs text-slate-500">
                      涉及 {activity.conceptCount} 个知识点
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-400">
                    {activity.occurredAt.toLocaleString("zh-CN")}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
              暂无正式评分或推荐练习证据。
            </p>
          )}
        </div>
        <aside className="rounded-2xl border bg-white p-5 sm:p-6">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100/70">
            <Sparkles aria-hidden="true" className="size-5 text-slate-700" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">画像说明</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            {data.summary}
          </p>
          <p className="mt-4 border-t pt-4 text-xs leading-5 text-slate-400">
            更新时间：{data.generatedAt.toLocaleString("zh-CN")}
            。出勤、自述和客观掌握证据分别计算，不会相互覆盖。
          </p>
        </aside>
      </section>
    </div>
  );
}

function KnowledgeStatus({ data }: { data: StudentCourseLearningCenter }) {
  return (
    <section
      className="scroll-mt-24 rounded-2xl border bg-white p-5 sm:p-6"
      id="knowledge-status"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit
              aria-hidden="true"
              className="size-5 text-slate-500"
            />
            <h2 className="text-lg font-semibold">按章节查看知识状态</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            章节按课程顺序纵向排列，展开后查看知识点状态和是否已授。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.values(statusPresentation).map((item) => (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${item.className}`}
              key={item.label}
            >
              <span className={`size-1.5 rounded-full ${item.dotClassName}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      {data.heatmap.length ? (
        <div className="mt-5 space-y-3">
          {data.heatmap.map((chapter, index) => (
            <details
              className="group overflow-hidden rounded-xl border bg-white open:shadow-sm"
              key={chapter.key}
              open={index === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 transition hover:bg-sky-50/60">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100/70 text-xs font-semibold text-slate-600">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {chapter.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {chapter.code} · {chapter.concepts.length} 个知识点
                    </span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-sky-100/70 px-3 py-1 text-xs text-slate-500">
                  {chapter.concepts.filter((concept) => concept.taught).length}/
                  {chapter.concepts.length} 已授
                </span>
              </summary>
              <div className="grid gap-2 border-t bg-sky-50/60 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {chapter.concepts.map((concept) => {
                  const presentation = statusPresentation[concept.status];
                  return (
                    <article
                      className="rounded-lg border bg-white p-3"
                      key={concept.key}
                      title={`${concept.name}：${presentation.label}；${concept.evidenceCount} 条证据${concept.taught ? "；已纳入教学进度" : "；尚未纳入教学进度"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm leading-5 text-slate-800">
                          {concept.name}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${presentation.className}`}
                        >
                          {presentation.label}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-400">
                        {concept.code} · {concept.taught ? "已授" : "未授"} ·{" "}
                        {concept.evidenceCount} 条证据
                      </p>
                      <div className="mt-3 border-t pt-3">
                        <p className="text-xs font-medium text-slate-600">
                          教师关联题目 · {concept.relatedQuestions.length} 道
                        </p>
                        {concept.relatedQuestions.length ? (
                          <>
                            <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto">
                              {concept.relatedQuestions.map((question) => (
                                <li
                                  className="rounded-md bg-slate-50 p-2"
                                  key={question.id}
                                >
                                  <p className="text-xs leading-5 text-slate-800">
                                    {question.title}
                                  </p>
                                  <p className="mt-1 text-[11px] text-slate-400">
                                    {QUESTION_TYPE_LABELS[question.type]} · 难度{" "}
                                    {question.difficulty}/5 ·{" "}
                                    {question.bindingType === "PRIMARY"
                                      ? "主要考查"
                                      : "次要涉及"}
                                    {question.fromCourseTeacher
                                      ? " · 任课教师题目"
                                      : " · 公共题库"}
                                  </p>
                                </li>
                              ))}
                            </ul>
                            {concept.conceptId ? (
                              <Link
                                className="mt-3 inline-flex rounded-md bg-sky-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-700 active:scale-[0.98]"
                                href={`/student/recommendations?view=generate&courseId=${encodeURIComponent(data.course.id)}&conceptId=${encodeURIComponent(concept.conceptId)}${data.classroom ? `&classroomId=${encodeURIComponent(data.classroom.id)}` : ""}`}
                              >
                                按此知识点选择练习或测试
                              </Link>
                            ) : null}
                          </>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">
                            教师尚未为此知识点绑定可练习题目。
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
          教师发布正式知识图谱后，这里会按章节展示学习状态。
        </p>
      )}
    </section>
  );
}

function PathColumn({
  title,
  step,
  empty,
  items,
  icon: Icon,
}: {
  title: string;
  step: string;
  empty: string;
  items: Array<{
    key: string;
    code: string;
    name: string;
    masteryScore: number | null;
    status: ConceptStatus;
    prerequisiteGaps?: string[];
  }>;
  icon: typeof CheckCircle2;
}) {
  return (
    <article className="overflow-hidden rounded-xl border">
      <header className="flex items-center justify-between border-b bg-sky-50/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-4 text-slate-600" />
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        <span className="text-xs font-semibold tracking-widest text-slate-400">
          {step}
        </span>
      </header>
      {items.length ? (
        <ol className="divide-y px-4">
          {items.map((item, index) => {
            const presentation = statusPresentation[item.status];
            return (
              <li className="py-3" key={item.key}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-100/70 text-[10px] font-semibold text-slate-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm leading-5">{item.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {item.masteryScore === null
                          ? item.code
                          : `${item.masteryScore}%`}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {presentation.label}
                      </span>
                      {item.prerequisiteGaps?.length ? (
                        <span className="text-xs text-amber-700">
                          先补：{item.prerequisiteGaps.join("、")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="p-4 text-sm leading-6 text-slate-500">{empty}</p>
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
}: {
  caption?: string;
  title: string;
  description: string;
  label: string;
  emptyMessage: string;
  points: StudentCourseLearningCenter["masteryTrend"];
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 sm:p-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <TrendChart
        ariaLabel={label}
        caption={caption}
        showDetails
        emptyMessage={emptyMessage}
        points={points}
      />
    </section>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="flex items-center justify-between rounded-lg border border-sky-200 bg-white/80 px-3 py-2.5 text-sm font-medium text-sky-700 transition hover:border-sky-300 hover:bg-white"
      href={href}
    >
      {label}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}
