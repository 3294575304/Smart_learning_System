import React from "react";
import { ArrowRight } from "lucide-react";
import { StudentPageLink } from "./student-page-link";
import { FOCUS_RING } from "./ui-focus";
import { monthDay } from "./student-time";
import type { StudentHomePulse } from "@/services/dashboard/student-home-pulse";

export function StudentRecentLearning({
  finished,
}: {
  finished: StudentHomePulse["finished"];
}) {
  return (
    <section
      className="workspace-panel st-home-panel st-recent-panel"
      aria-labelledby="student-recent-heading"
    >
      <header className="st-panel-header flex items-center justify-between">
        <h2 id="student-recent-heading">最近学习</h2>
        <StudentPageLink
          className={`st-section-link ${FOCUS_RING}`}
          href="/student/analytics"
        >
          学习分析 <ArrowRight aria-hidden="true" className="size-3" />
        </StudentPageLink>
      </header>
      {finished.length ? (
        <ul>
          {finished.slice(0, 3).map((item) => (
            <li className="st-recent-row" key={item.submissionId}>
              <time
                className="st-recent-date"
                dateTime={item.submittedAt.toISOString()}
              >
                {monthDay(item.submittedAt)}
              </time>
              <div className="min-w-0 flex-1">
                <StudentPageLink
                  className={`st-agenda-title ${FOCUS_RING}`}
                  href={item.href}
                >
                  {item.title}
                </StudentPageLink>
                <p className="st-agenda-meta">
                  {item.courseName} ·{" "}
                  {item.graded && item.score !== null
                    ? "已批改"
                    : "已交，等待批改"}
                </p>
              </div>
              {item.graded && item.score !== null ? (
                <p className="st-recent-score">
                  {item.score}
                  <span>{item.maxScore ? ` / ${item.maxScore}` : " 分"}</span>
                </p>
              ) : (
                <span className="st-course-tag">待批改</span>
              )}
              <StudentPageLink
                className={`st-section-link ${FOCUS_RING}`}
                href={item.href}
                aria-label={`查看${item.title}`}
              >
                <ArrowRight aria-hidden="true" className="size-4" />
              </StudentPageLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="st-panel-empty">
          还没有已提交的学习记录。完成作业后，可以在这里查看结果。
        </p>
      )}
    </section>
  );
}
