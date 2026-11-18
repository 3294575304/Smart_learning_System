import { ListChecks, PackageOpen, Target } from "lucide-react";
import Link from "next/link";

import { MetricTile, Panel, SectionHeading } from "@/components/ui/panel";
import type {
  ContentCoveragePoint,
  CourseContentCoverage,
} from "@/services/courses/content-coverage";
import { CourseCoverageRetry } from "./course-coverage-retry";

const quietLink =
  "inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md border border-line bg-card px-2.5 text-xs font-medium text-ink-body hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

const disclosureClass = "border-line mt-4 rounded-lg border px-3 py-2";
const summaryClass =
  "text-ink-body min-h-10 cursor-pointer content-center rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

function CoveragePointList({
  points,
  courseId,
  mode,
}: {
  points: ContentCoveragePoint[];
  courseId: string;
  mode: "create" | "view";
}) {
  return (
    <ul className="mt-2 divide-y">
      {points.map((point) => {
        const create = mode === "create";
        const href = create
          ? `/teacher/questions/new?${new URLSearchParams({ courseId, conceptId: point.conceptId })}`
          : `/teacher/courses/${courseId}/knowledge-graph?${new URLSearchParams({ conceptId: point.conceptId })}`;
        const label = create ? "创建题目" : "查看已绑题目";

        return (
          <li
            className="flex flex-wrap items-center justify-between gap-2 py-2"
            key={point.conceptId}
          >
            <div className="min-w-0 text-sm [overflow-wrap:anywhere]">
              <span className="text-ink-soft mr-1.5 text-xs">{point.code}</span>
              <span>{point.name}</span>
              <p className="text-ink-soft mt-0.5 text-xs">
                {point.chapterName ?? "未归章"}
                {create ? null : ` · ${point.questionCount} 道有效题目`}
              </p>
            </div>
            <Link
              aria-label={`${label}（${point.name}）`}
              className={quietLink}
              href={href}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CourseContentCoverage({
  courseId,
  coverage,
}: {
  courseId: string;
  coverage: CourseContentCoverage | null;
}) {
  if (!coverage) {
    return (
      <Panel id="course-content-coverage" className="scroll-mt-24">
        <SectionHeading
          title="内容覆盖自检"
          description="暂时无法读取覆盖统计。"
        />
        <CourseCoverageRetry />
      </Panel>
    );
  }
  if (!coverage.graphVersion) {
    return (
      <Panel id="course-content-coverage" className="scroll-mt-24">
        <SectionHeading
          icon={
            <PackageOpen aria-hidden="true" className="text-ink-soft size-5" />
          }
          title="内容覆盖自检"
          description="当前还没有正式知识图谱版本。发布图谱后即可查看题目覆盖和评分证据。"
        />
        <Link
          className={`${quietLink} mt-3`}
          href={`/teacher/courses/${courseId}/knowledge-graph`}
        >
          前往知识图谱
        </Link>
      </Panel>
    );
  }

  const { totals, gaps, chapters, pointsWithoutEvidence } = coverage;
  if (totals.conceptCount === 0) {
    return (
      <Panel id="course-content-coverage" className="scroll-mt-24">
        <SectionHeading
          title="内容覆盖自检"
          description={`正式图谱 v${coverage.graphVersion} 暂无知识点。添加知识点并发布图谱后即可查看覆盖情况。`}
        />
        <Link
          className={`${quietLink} mt-3`}
          href={`/teacher/courses/${courseId}/knowledge-graph`}
        >
          查看知识图谱
        </Link>
      </Panel>
    );
  }
  const topGaps = gaps.slice(0, 8);
  return (
    <Panel id="course-content-coverage" className="scroll-mt-24">
      <SectionHeading
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              className={quietLink}
              href={`/teacher/courses/${courseId}/objective-map`}
            >
              <Target aria-hidden="true" className="size-3.5" />
              知识点—目标映射
            </Link>
            <Link
              className={quietLink}
              href={`/teacher/courses/${courseId}/question-mapping`}
            >
              <ListChecks aria-hidden="true" className="size-3.5" />
              批量关联题目
            </Link>
          </div>
        }
        description="按课程汇总题目覆盖与评分证据，供备课时参考。"
        icon={
          <PackageOpen aria-hidden="true" className="text-ink-soft size-5" />
        }
        title="内容覆盖自检"
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricTile
          detail={`当前正式图谱 v${coverage.graphVersion}`}
          label="知识点"
          value={totals.conceptCount}
        />
        <MetricTile
          detail={
            totals.bindingRate === null
              ? "尚无知识点"
              : `覆盖 ${totals.bindingRate}% · 未绑题 ${gaps.length} 个`
          }
          label="有题绑定"
          tone={
            totals.boundConceptCount === totals.conceptCount
              ? "default"
              : "muted"
          }
          value={totals.boundConceptCount}
        />
        <MetricTile
          detail={
            totals.evidenceRate === null
              ? "尚无知识点"
              : `覆盖 ${totals.evidenceRate}% · 任一学生有有效证据`
          }
          label="已有评分证据"
          tone={
            totals.evidencedConceptCount === totals.conceptCount
              ? "default"
              : "muted"
          }
          value={totals.evidencedConceptCount}
        />
      </div>
      {topGaps.length ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-ink text-sm font-medium">
              尚未绑定题目的知识点
              <span className="text-ink-soft ml-1 font-normal">
                （{gaps.length} 个）
              </span>
            </h3>
            <p className="text-ink-soft text-xs">
              可为知识点创建题目，也可通过「批量关联题目」补充已有题目。
            </p>
          </div>
          <CoveragePointList
            points={topGaps}
            courseId={courseId}
            mode="create"
          />
          {gaps.length > topGaps.length ? (
            <details className={disclosureClass}>
              <summary className={summaryClass}>
                查看其余 {gaps.length - topGaps.length} 个未绑题知识点
              </summary>
              <CoveragePointList
                points={gaps.slice(topGaps.length)}
                courseId={courseId}
                mode="create"
              />
            </details>
          ) : null}
        </div>
      ) : (
        <p className="text-ink-soft mt-4 text-sm">
          全部知识点均已绑定有效题目。
        </p>
      )}
      <details className={disclosureClass}>
        <summary className={summaryClass}>
          已绑题但暂无评分证据（{pointsWithoutEvidence.length} 个）
        </summary>
        {pointsWithoutEvidence.length ? (
          <>
            <p className="text-ink-soft text-sm">
              可查看已绑题目，按教学进度安排作业或练习，并核对已有作答的评分情况。
            </p>
            <CoveragePointList
              points={pointsWithoutEvidence}
              courseId={courseId}
              mode="view"
            />
          </>
        ) : (
          <p className="text-ink-soft text-sm">
            当前没有已绑题但缺少评分证据的知识点。
          </p>
        )}
      </details>
      {chapters.length > 0 ? (
        <details className={disclosureClass}>
          <summary className={summaryClass}>按章节查看覆盖</summary>
          <ul className="mt-2 divide-y">
            {chapters.map((chapter) => (
              <li
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                key={chapter.key}
              >
                <span className="[overflow-wrap:anywhere]">{chapter.name}</span>
                <span className="text-ink-soft text-xs tabular-nums">
                  有题 {chapter.boundConceptCount}/{chapter.conceptCount} ·
                  有证据 {chapter.evidencedConceptCount}/{chapter.conceptCount}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <details className={disclosureClass}>
        <summary className={summaryClass}>统计口径</summary>
        <dl className="text-ink-soft space-y-2 pb-1 text-sm leading-6">
          <div>
            <dt className="text-ink-body font-medium">知识点</dt>
            <dd>
              以当前正式发布的课程图谱为准。两项覆盖率都以这些知识点的总数为分母。
            </dd>
          </div>
          <div>
            <dt className="text-ink-body font-medium">有题绑定</dt>
            <dd>
              至少绑定一道启用且未删除的题目。完成绑定后即可计入覆盖，题目是否已布置单独判断。
            </dd>
          </div>
          <div>
            <dt className="text-ink-body font-medium">已有评分证据</dt>
            <dd>
              任一学生在本课程的最新掌握度记录中已有该知识点的有效评分证据。评分证据随作答评分及掌握度更新，用于衡量覆盖范围，学生个人的掌握情况请查看学情分析。
            </dd>
          </div>
        </dl>
      </details>
    </Panel>
  );
}
