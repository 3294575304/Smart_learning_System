import React from "react";

import { StudentPageLink } from "./student-page-link";
import { FOCUS_RING } from "./ui-focus";
import { StudentRecentLearning } from "./student-recent-learning";
import { StudentHomeAgenda } from "./student-home-agenda";
import { StudentKnowledgeSummary } from "./student-knowledge-summary";
import { StudentWrongBookCard } from "./student-wrong-book-card";
import { StudentEnrollmentPicker } from "./student-enrollment-picker";
import {
  HomeKnowledgeMatrix,
  type HomeKnowledgeChapter,
} from "./home-knowledge-matrix";
import { dueLabel } from "./student-time";
import type { StudentClassAnalysis } from "@/services/dashboard/student-class-analytics";
import type { StudentHomePulse } from "@/services/dashboard/student-home-pulse";
import type { StudentTaskOverview } from "@/services/dashboard/student-task-overview";
import { studentCourseTabHref } from "@/services/courses/student-workspace";

const MASTERED = 80;

function averageScore(concepts: Array<{ masteryScore: number | null }>) {
  const scored = concepts
    .map((concept) => concept.masteryScore)
    .filter((score): score is number => score !== null);
  if (!scored.length) return null;
  return Math.round(
    scored.reduce((sum, score) => sum + score, 0) / scored.length,
  );
}

function hours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

export function StudentHomeInsights({
  classes,
  selected,
  chapters,
  knowledgeError = false,
  overview,
  pulse,
  now,
}: {
  classes: StudentClassAnalysis[];
  selected?: StudentClassAnalysis;
  chapters: HomeKnowledgeChapter[];
  knowledgeError?: boolean;
  overview: StudentTaskOverview;
  pulse: StudentHomePulse;
  now: Date;
}) {
  const pendingAssignments = overview.pendingItems.filter(
    (item) => item.kind === "assignment",
  );
  const nextDue = pendingAssignments.reduce<Date | null>(
    (earliest, item) =>
      !earliest || item.dueAt < earliest ? item.dueAt : earliest,
    null,
  );
  const concepts = chapters.flatMap((chapter) => chapter.concepts);
  const overall = averageScore(concepts);
  const masteredChapters = chapters.filter(
    (chapter) => (averageScore(chapter.concepts) ?? 0) >= MASTERED,
  ).length;
  const weeklyDelta = pulse.weekly.minutes - pulse.weekly.previousMinutes;

  const metrics = [
    {
      key: "backlog",
      label: "待完成作业",
      value: pendingAssignments.length,
      unit: "份",
      detail: [
        nextDue ? `最近截止 ${dueLabel(nextDue, now)}` : "没有待交作业",
        overview.counts.exam > 0 ? `另有 ${overview.counts.exam} 场考试` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/student/tasks",
      alert: pendingAssignments.length > 0,
    },
    {
      key: "weekly",
      label: "本周学习",
      value: pulse.weekly.minutes > 0 ? hours(pulse.weekly.minutes) : null,
      unit: "小时",
      detail:
        pulse.weekly.minutes === 0
          ? "本周还没有学习记录"
          : pulse.weekly.previousMinutes === 0
            ? "上周没有学习记录"
            : weeklyDelta >= 0
              ? `较上周 +${hours(weeklyDelta)}`
              : `较上周 -${hours(-weeklyDelta)}`,
      href: "/student/analytics",
      alert: false,
    },
    {
      key: "mastery",
      label: "知识掌握",
      value: overall,
      unit: "%",
      detail:
        chapters.length > 0
          ? `已掌握 ${masteredChapters} 章 · 共 ${chapters.length} 章`
          : "还没有可评估的知识点",
      href: selected
        ? studentCourseTabHref(
            selected.course.id,
            selected.classroom.id,
            "growth",
            "profile",
          )
        : "/student/analytics",
      alert: false,
    },
    {
      key: "streak",
      label: "连续学习",
      value: pulse.streak.days,
      unit: "天",
      detail:
        pulse.streak.longest > 0
          ? `最长记录 ${pulse.streak.longest} 天`
          : "今天开始记录",
      href: "/student/analytics",
      alert: false,
    },
  ];

  const profileHref = selected
    ? studentCourseTabHref(
        selected.course.id,
        selected.classroom.id,
        "growth",
        "profile",
      )
    : "/student/courses";

  return (
    <section
      aria-label="学习中心数据看板"
      className="workspace-insights space-y-4"
    >
      <ul
        aria-label="学习概览"
        className="workspace-metrics grid grid-cols-2 gap-2.5 @min-[48rem]:grid-cols-4"
      >
        {metrics.map((metric) => (
          <li className="min-w-0" key={metric.key}>
            <StudentPageLink
              className={`st-metric ${metric.alert ? "is-alert" : ""} ${FOCUS_RING}`}
              href={metric.href}
            >
              <p className="st-metric-label">{metric.label}</p>
              <p className="st-metric-value">
                {metric.value === null ? (
                  <span className="st-metric-empty">—</span>
                ) : (
                  <>
                    {metric.value}
                    {metric.unit ? (
                      <span className="st-metric-unit">{metric.unit}</span>
                    ) : null}
                  </>
                )}
              </p>
              <p className="st-metric-detail">{metric.detail}</p>
            </StudentPageLink>
          </li>
        ))}
      </ul>

      <div className="workspace-home-columns grid gap-4 has-[details[open]]:items-start @min-[48rem]:grid-cols-[minmax(0,1.9fr)_minmax(280px,1fr)]">
        <div className="workspace-home-column flex min-w-0 flex-col gap-4">
          <StudentHomeAgenda now={now} overview={overview} pulse={pulse} />
          <StudentRecentLearning finished={pulse.finished} />
        </div>

        <div className="workspace-home-column flex min-w-0 flex-col gap-4">
          <section
            aria-label="课程知识掌握"
            className="workspace-panel st-home-panel st-knowledge-card border-border bg-card min-w-0 rounded-lg border p-4"
          >
            {knowledgeError ? (
              <p className="bg-muted/65 rounded-md px-3 py-2 text-xs leading-5 text-neutral-600">
                知识掌握暂时无法加载，其他内容可以继续查看。
              </p>
            ) : (
              <StudentKnowledgeSummary
                chapters={chapters}
                courseName={selected?.course.name}
                courseSelector={
                  classes.length > 1 && selected ? (
                    <StudentEnrollmentPicker
                      action="/student"
                      contexts={classes.map((item) => ({
                        course: item.course,
                        classroom: item.classroom,
                      }))}
                      selectedId={selected.classroom.id}
                    />
                  ) : null
                }
              />
            )}
            {!knowledgeError && chapters.length > 0 ? (
              <details className="st-knowledge-details">
                <summary>展开知识点明细</summary>
                <HomeKnowledgeMatrix
                  chapters={chapters}
                  dashboard
                  generatedAt={null}
                  profileHref={profileHref}
                  profileRevision={null}
                />
              </details>
            ) : null}
          </section>

          <StudentWrongBookCard
            lastReviewedAt={pulse.wrongBook.lastReviewedAt}
            newInWeek={pulse.wrongBook.newInWeek}
            now={now}
            open={pulse.wrongBook.open}
          />
        </div>
      </div>
    </section>
  );
}
