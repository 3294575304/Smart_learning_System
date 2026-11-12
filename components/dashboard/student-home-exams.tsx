import React from "react";
import { CalendarClock, History } from "lucide-react";
import { StudentPageLink } from "./student-page-link";
import { StudentExamCountdown } from "./student-exam-countdown";
import { FOCUS_RING, FOCUS_RING_ON_DARK } from "./ui-focus";
import { activityHref } from "@/services/student-experience/activity-query";
import {
  studentTaskContext,
  studentTaskDate,
  type StudentTaskItem,
} from "@/services/dashboard/student-task-overview";
import type { StudentHomeExamResult } from "@/services/dashboard/student-class-analytics";
import { studentTaskHref } from "@/services/student-experience/task-scope";

const card = "flex min-w-0 flex-col gap-3 rounded-[1.25rem] border p-4 sm:p-5";
const recentCard = `${card} border-border bg-card`;
const quietCard =
  "flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[1.25rem] border border-dashed border-border bg-card px-4 py-3";
const quietHeading =
  "flex min-w-0 items-center gap-2 text-sm font-medium text-neutral-700";
const action = `inline-flex min-h-10 items-center rounded-md bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-strong ${FOCUS_RING}`;
const allExams = `inline-flex min-h-10 items-center rounded-md text-sm font-medium underline-offset-4 hover:underline ${FOCUS_RING}`;
/**
 * 深色考试卡内的次要链接：深底上白字下划线会和主按钮抢焦点，
 * 降一档成 sky-100，hover 再回到白色；焦点环也必须换成白色，否则不可见。
 */
const allExamsOnDark = `inline-flex min-h-10 items-center rounded-md text-sm font-medium text-sky-100 underline-offset-4 hover:text-white hover:underline ${FOCUS_RING_ON_DARK}`;

export function StudentHomeExams({
  next,
  recent,
  classAverage,
  upcomingCount,
  now,
  slot,
}: {
  next: StudentTaskItem | null;
  recent: StudentHomeExamResult | null;
  classAverage: number | null;
  upcomingCount: number;
  now: Date;
  slot: "next" | "recent";
}) {
  if (slot === "next" && !next) {
    return (
      <section aria-labelledby="home-next-exam" className={quietCard}>
        <h2 id="home-next-exam" className={quietHeading}>
          <CalendarClock
            aria-hidden="true"
            className="size-4 text-neutral-500"
          />
          下一场考试
          <span className="font-normal text-neutral-600">· 暂无安排</span>
        </h2>
        <StudentPageLink href="/student/exams" className={allExams}>
          考试安排
        </StudentPageLink>
      </section>
    );
  }
  if (slot === "recent" && !recent) {
    return (
      <section aria-labelledby="home-recent-exam" className={quietCard}>
        <h2 id="home-recent-exam" className={quietHeading}>
          <History aria-hidden="true" className="size-4 text-neutral-500" />
          最近考试
          <span className="font-normal text-neutral-600">· 暂无考试记录</span>
        </h2>
        <StudentPageLink href="/student/exams" className={allExams}>
          全部考试
        </StudentPageLink>
      </section>
    );
  }
  const scope = recent
    ? { courseId: recent.courseId, classroomId: recent.classroomId }
    : {};
  const report = recent
    ? studentTaskHref(`/student/exams/${recent.examId}/report`, scope)
    : "";
  const difference =
    recent?.percentage != null && classAverage !== null
      ? Math.round((recent.percentage - classAverage) * 10) / 10
      : null;
  return (
    <>
      {slot === "next" && next && (
        <section
          aria-labelledby="home-next-exam"
          className={`${card} border-brand-strong bg-brand-strong text-white`}
        >
          <h2 id="home-next-exam" className="text-xl font-semibold">
            {next.canEnter ? "正在进行的考试" : "下一场考试"}
          </h2>
          <div className="min-w-0">
            <p className="text-base [overflow-wrap:anywhere] text-sky-100">
              <strong className="font-medium text-white">{next.title}</strong>
              {next.opensAt && (
                <>
                  {" · "}
                  <time dateTime={next.opensAt.toISOString()}>
                    {studentTaskDate(next.opensAt)}
                  </time>{" "}
                  开考
                </>
              )}
              {next.windowMinutes !== undefined &&
                ` · 限时 ${next.windowMinutes} 分钟`}
            </p>
            <p className="mt-1 text-xs [overflow-wrap:anywhere] text-sky-100">
              {studentTaskContext(next)}
            </p>
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <StudentPageLink
              href={next.href}
              className={`bg-card hover:bg-muted inline-flex min-h-10 items-center rounded-md px-3.5 text-sm font-semibold text-neutral-950 ${FOCUS_RING_ON_DARK}`}
            >
              {next.action}
            </StudentPageLink>
            {next.opensAt && (
              <StudentExamCountdown
                targetAt={(next.canEnter ? next.dueAt : next.opensAt).getTime()}
                renderedAt={now.getTime()}
                canEnter={Boolean(next.canEnter)}
              />
            )}
            {upcomingCount > (next.canEnter ? 0 : 1) && (
              <StudentPageLink
                href="/student/exams?status=UPCOMING"
                className={allExamsOnDark}
              >
                查看待开考安排
              </StudentPageLink>
            )}
          </div>
        </section>
      )}
      {slot === "recent" && recent && (
        <section aria-labelledby="home-recent-exam" className={recentCard}>
          <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <h2 id="home-recent-exam" className="text-xl font-semibold">
              最近考试
            </h2>
            <StudentPageLink
              href="/student/exams"
              className={allExams}
              aria-label="查看全部考试"
            >
              全部
            </StudentPageLink>
          </div>
          <div className="min-w-0">
            <p className="font-medium [overflow-wrap:anywhere] text-neutral-950">
              {recent.title}
            </p>
            <p className="mt-1 text-sm [overflow-wrap:anywhere] text-neutral-600">
              {studentTaskContext(recent)}
            </p>
          </div>
          {recent.resultState === "PUBLISHED" ? (
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-neutral-700">
              <strong className="text-3xl font-medium text-neutral-950 tabular-nums">
                {recent.percentage} 分
              </strong>
              <span>
                {difference === null
                  ? "暂无可展示的班均"
                  : difference === 0
                    ? "与班均持平"
                    : `${difference > 0 ? "高于" : "低于"}班均 ${Math.abs(difference)} 分`}
              </span>
            </p>
          ) : (
            <p className="text-sm font-medium text-neutral-700">
              {recent.resultState === "AWAITING"
                ? "成绩待公布"
                : recent.resultState === "MISSED"
                  ? "已错过考试"
                  : "成绩状态已登记"}
            </p>
          )}
          <p className="text-sm text-neutral-600">
            <time dateTime={recent.endsAt.toISOString()}>
              {studentTaskDate(recent.endsAt)}
            </time>{" "}
            结束
          </p>
          <div className="mt-auto flex flex-wrap gap-2">
            {recent.resultState === "PUBLISHED" ? (
              <>
                {recent.publishedSubmissionId && (
                  <StudentPageLink
                    href={studentTaskHref(
                      `/student/submissions/${recent.publishedSubmissionId}/result`,
                      scope,
                    )}
                    className={allExams}
                  >
                    查看答卷
                  </StudentPageLink>
                )}
                <StudentPageLink
                  href={`${report}#exam-wrong-questions`}
                  className={action}
                >
                  考试报告与错题
                </StudentPageLink>
              </>
            ) : (
              <StudentPageLink
                href={activityHref("exams", {
                  ...scope,
                  focus: recent.assignmentId,
                })}
                className={action}
              >
                查看考试记录
              </StudentPageLink>
            )}
          </div>
        </section>
      )}
    </>
  );
}
