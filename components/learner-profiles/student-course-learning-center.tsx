import { CheckCircle2, Clock3, GitBranch, Route } from "lucide-react";
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
  const scope = new URLSearchParams({
    courseId: data.course.id,
    ...(data.classroom ? { classroomId: data.classroom.id } : {}),
  }).toString();
  const masteryPoints = data.masteryTrend;
  /*
   * 小样本提示按「哪条线点不够」分别生成。
   * 原来它只写在 scoreTrend 分支里，而趋势页传 scoreTrend={false}，
   * 于是掌握度只剩 1 个点时页面毫无提示，容易被读成「数据丢了」。
   */
  const smallSampleNotes = [
    masteryPoints.length > 0 && masteryPoints.length < 3
      ? `稳定掌握度只有 ${masteryPoints.length} 个版本`
      : null,
    scoreTrend && data.accuracyTrend.length > 0 && data.accuracyTrend.length < 3
      ? `得分率只有 ${data.accuracyTrend.length} 次`
      : null,
  ].filter((note): note is string => Boolean(note));
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
        <Panel
          className="flex h-full min-h-0 scroll-mt-24 flex-col overflow-hidden"
          id="learning-path"
        >
          <div className="shrink-0">
            <SectionHeading
              description="「优先巩固」清单已合并到「本周计划」，这里只列已掌握与尚无评分记录的知识点，用来核对整体进度。"
              icon={
                <Route aria-hidden="true" className="text-ink-soft size-5" />
              }
              level="page"
              title="我的学习路径"
            />
          </div>
          {/*
            主区由本周计划承担（有序、可勾选、每项带去练），这里降为参考信息。
            两块卡片等高：外层是固定高度的 flex 列，只有这里滚动，
            避免出现「卡片内滚动条 + 页面滚动条」双层收缩。
          */}
          <div className="mt-4 grid min-h-0 flex-1 [scrollbar-gutter:stable] content-start gap-4 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
            {[
              {
                key: "mastered",
                title: "已掌握",
                icon: CheckCircle2,
                items: data.learningPath.mastered,
                empty: "完成相关题目并拿到评分后，就能看到哪些内容已经掌握。",
              },
              {
                key: "next",
                title: "尚无评分记录",
                icon: GitBranch,
                items: data.learningPath.next,
                empty: data.overview.totalConcepts
                  ? "所有知识点已有评分记录。"
                  : "等待教师发布课程知识图谱。",
              },
            ]
              .filter((column) => column.items.length > 0)
              .map(({ key, ...column }) => (
                <PathColumn
                  key={key}
                  {...column}
                  chaptersByPoint={chaptersByPoint}
                  readOnly={readOnly}
                  scope={{
                    courseId: data.course.id,
                    classroomId: data.classroom?.id ?? null,
                  }}
                  previewCount={0}
                />
              ))}
            {data.learningPath.mastered.length === 0 &&
            data.learningPath.next.length === 0 ? (
              <p className="text-ink-soft border-line rounded-xl border border-dashed p-4 text-sm leading-6">
                目前没有可归类的知识点。完成作业或练习、拿到评分后，这里会区分「已掌握」与「尚无评分记录」。
              </p>
            ) : null}
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
              {smallSampleNotes.length ? (
                <p className="mt-1 text-xs text-amber-700">
                  样本较少：{smallSampleNotes.join("、")}
                  ，趋势仅供参考，累积到 3 个点后更稳定。
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

          <section className="scroll-mt-24" id="learning-records">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock3 aria-hidden="true" className="text-ink-soft size-5" />
                  <h2 className="text-ink text-[15px] font-semibold">
                    我的学习记录
                  </h2>
                </div>
                <p className="text-ink-soft text-xs">
                  共 {data.recentActivity.length} 条 · 按时间倒序
                </p>
              </div>
              {data.recentActivity.length ? (
                <ol className="mt-4 divide-y">
                  {data.recentActivity.map((activity) => {
                    /*
                     * 作业类事件带着提交 ID，可以直达「本次作业结果」；
                     * 练习类没有单次结果页，退回课程练习记录，
                     * 文案跟着改，不让人以为点进去还是这张时间线。
                     */
                    const href =
                      activity.href ??
                      (activity.kind === "assignment"
                        ? `/student/results?view=course&${scope}`
                        : `/student/recommendations?${scope}`);
                    const actionLabel = activity.href
                      ? "查看本次作业结果"
                      : activity.kind === "assignment"
                        ? "查看成绩记录"
                        : "查看练习记录";
                    return (
                      <li
                        className="flex items-start gap-3 py-3 first:pt-0"
                        key={activity.id}
                      >
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {activity.label}
                          </p>
                          <p className="text-ink-soft mt-1 text-xs">
                            涉及 {activity.conceptCount} 个知识点
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <time className="text-ink-soft block text-xs">
                            {activity.occurredAt.toLocaleString("zh-CN")}
                          </time>
                          <Link
                            className="text-brand-strong mt-1 inline-flex min-h-9 items-center text-xs underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                            href={href}
                          >
                            {actionLabel}
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-ink-soft mt-4 rounded-xl border border-dashed p-8 text-center text-sm">
                  当前区间内没有作业或练习评分记录。切换「全部」可以看完整历史。
                </p>
              )}
            </Panel>
            {/*
              原先右侧是一整张「画像说明」卡，内容和「我的画像」首段重复，
              白占 1/3 行宽。改成卡下一行脚注，信息保留、版面收窄。
            */}
            <p className="text-ink-soft mt-3 text-xs leading-5">
              {data.summary}（更新于 {data.generatedAt.toLocaleString("zh-CN")}
              。出勤、自我反思与知识掌握分别计算，不会相互覆盖。）
            </p>
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
              {/* 内层不再单独滚动：滚动交给整块「我的学习路径」的列表区，避免双层滚动条。 */}
              <div
                role="region"
                aria-label={`${title}章节列表`}
                tabIndex={0}
                className="border-line focus-visible:outline-brand mt-1 min-w-0 rounded-md border px-3 pb-1 focus-visible:outline-2 focus-visible:outline-offset-2"
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
