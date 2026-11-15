import {
  BrainCircuit,
  CheckCircle2,
  Clock3,
  GitBranch,
  Route,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { TrendChart } from "@/components/dashboard/trend-chart";
import { knowledgeStateDot } from "@/components/ui/knowledge-state";
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

export function StudentCourseLearningCenterView({
  data,
  tab = "path",
  scoreTrend = true,
}: {
  data: StudentCourseLearningCenter;
  tab?: "path" | "knowledge" | "activity";
  /**
   * 是否渲染「近期评分得分率」。课程学习中心的趋势页已经有 ScoreChart 画作业成绩，
   * 两张图讲的是同一件事（按次得分率），并排只会让人对不上刻度。
   */
  scoreTrend?: boolean;
}) {
  return (
    <div className="space-y-6">
      {tab === "path" && (
        <section
          className="border-line bg-card scroll-mt-24 rounded-xl border p-5 sm:p-6"
          id="learning-path"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Route aria-hidden="true" className="text-ink-soft size-5" />
                <h2 className="text-ink text-[15px] font-semibold">
                  我的学习路径
                </h2>
              </div>
              <p className="text-ink-soft mt-1 text-sm">
                先复习还不熟悉的内容，再按课程顺序学习新的知识点。
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <PathColumn
              empty="完成相关题目并拿到评分后，就能看到哪些内容已经掌握。"
              icon={CheckCircle2}
              items={data.learningPath.mastered}
              step="01"
              title="已经掌握"
            />
            <PathColumn
              empty={
                data.overview.evidenceConcepts === 0
                  ? "先完成几道作业或练习题，看看掌握得怎么样。"
                  : "有评分记录的知识点都已掌握，可以继续学习其他内容。"
              }
              icon={TriangleAlert}
              items={data.learningPath.current}
              step="02"
              title="优先巩固"
            />
            <PathColumn
              empty="课程中的知识点都有评分记录了，可以回头复习还不熟悉的内容。"
              icon={GitBranch}
              items={data.learningPath.next}
              step="03"
              title="接下来学"
            />
          </div>
        </section>
      )}
      {tab === "knowledge" && <KnowledgeStatus data={data} />}
      {tab === "activity" && (
        <>
          <section className="scroll-mt-24 space-y-4" id="learning-trend">
            <div>
              <h2 className="text-ink text-[15px] font-semibold">
                我的学习趋势
              </h2>
              <p className="text-ink-soft mt-1 text-sm">
                {scoreTrend
                  ? "掌握度只采用达到证据门槛的画像；得分率按已发布作业、已完成整组练习展示，二者取样不同。"
                  : "掌握度只采用达到证据门槛的画像，未评估不等于零分；得分率见上方「我的作业成绩」。"}
              </p>
            </div>
            <div className={`grid gap-6 ${scoreTrend ? "xl:grid-cols-2" : ""}`}>
              <TrendPanel
                description="课程汇总：仅统计证据充足知识点，未评估不等于零分。"
                caption="课程汇总 · 各版本只统计当时证据充足的知识点，覆盖范围可能变化；展开查看版本和更新时间。"
                emptyMessage="当前还没有足够的历史画像生成趋势。"
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
            <div className="border-line bg-card min-w-0 rounded-xl border p-5 sm:p-6">
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
                  暂无正式评分或推荐练习证据。
                </p>
              )}
            </div>
            <aside className="border-line bg-card rounded-xl border p-5 sm:p-6">
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
                。出勤、自述和客观掌握证据分别计算，不会相互覆盖。
              </p>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}

function KnowledgeStatus({ data }: { data: StudentCourseLearningCenter }) {
  return (
    <section
      className="border-line bg-card scroll-mt-24 rounded-xl border p-5 sm:p-6"
      id="knowledge-status"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit aria-hidden="true" className="text-ink-soft size-5" />
            <h2 className="text-ink text-[15px] font-semibold">
              按章节查看知识状态
            </h2>
          </div>
          <p className="text-ink-soft mt-1 text-sm">
            看看哪些内容已经熟悉，哪些还需要多练。
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
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 transition hover:bg-sky-50/60">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="text-ink-soft flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100/70 text-xs font-semibold">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {chapter.name}
                    </span>
                    <span className="text-ink-soft mt-0.5 block text-xs">
                      {chapter.code} · {chapter.concepts.length} 个知识点
                    </span>
                  </span>
                </span>
                <span className="text-ink-soft shrink-0 rounded-full bg-sky-100/70 px-3 py-1 text-xs">
                  {
                    chapter.concepts.filter(
                      (concept) => concept.evidenceCount > 0,
                    ).length
                  }
                  /{chapter.concepts.length} 有评分
                </span>
              </summary>
              <div className="grid gap-2 border-t bg-sky-50/60 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {chapter.concepts.map((concept) => {
                  const presentation = statusPresentation[concept.status];
                  return (
                    <article
                      className="rounded-lg border bg-white p-3"
                      key={concept.key}
                      title={`${concept.name}，${presentation.label}，${concept.evidenceCount} 条评分记录`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-ink text-sm leading-5">
                          {concept.name}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${presentation.className}`}
                        >
                          {presentation.label}
                        </span>
                      </div>
                      <p className="text-ink-soft mt-2 text-xs">
                        {concept.code} · {concept.evidenceCount} 条评分记录
                      </p>
                      <div className="mt-3 border-t pt-3">
                        <p className="text-ink-soft text-xs font-medium">
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
                                  <p className="text-ink text-xs leading-5">
                                    {question.title}
                                  </p>
                                  <p className="text-ink-soft mt-1 text-[11px]">
                                    {QUESTION_TYPE_LABELS[question.type]} ·{" "}
                                    {question.bindingType === "PRIMARY"
                                      ? "主要考查"
                                      : "次要涉及"}
                                    {" · 课程题库"}
                                  </p>
                                </li>
                              ))}
                            </ul>
                            {concept.conceptId ? (
                              <Link
                                className="mt-3 inline-flex rounded-md bg-sky-700 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-800 active:scale-[0.98]"
                                href={`/student/recommendations?view=generate&courseId=${encodeURIComponent(data.course.id)}&conceptId=${encodeURIComponent(concept.conceptId)}${data.classroom ? `&classroomId=${encodeURIComponent(data.classroom.id)}` : ""}`}
                              >
                                按此知识点选择练习或测试
                              </Link>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-ink-soft mt-2 text-xs">
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
        <p className="text-ink-soft mt-5 rounded-xl border border-dashed p-8 text-center text-sm">
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
          <Icon aria-hidden="true" className="text-ink-soft size-4" />
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        <span className="text-ink-soft text-xs font-semibold tracking-widest">
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
                  <span className="text-ink-soft mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sky-100/70 text-[10px] font-semibold">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`size-2.5 shrink-0 ${knowledgeStateDot[item.status]}`}
                        />
                        <span className="text-sm leading-5">{item.name}</span>
                      </span>
                      <span className="text-ink-soft shrink-0 text-xs">
                        {item.masteryScore === null
                          ? item.code
                          : `${item.masteryScore}%`}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-ink-soft text-xs">
                        {presentation.label}
                      </span>
                    </div>
                    {/*
                      前置缺口原来跟在状态词后面，只是一句琥珀色小字，几乎没人会读到。
                      提到独立一行，学生才能看出自己卡在哪个前置知识点上。
                    */}
                    {item.prerequisiteGaps?.length ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        先补：{item.prerequisiteGaps.join("、")}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
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
}: {
  caption?: string;
  title: string;
  description: string;
  label: string;
  emptyMessage: string;
  points: StudentCourseLearningCenter["masteryTrend"];
}) {
  return (
    <section className="border-line bg-card min-w-0 rounded-xl border p-5 sm:p-6">
      <h3 className="text-ink text-[15px] font-semibold">{title}</h3>
      <p className="text-ink-soft mt-1 text-sm">{description}</p>
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
