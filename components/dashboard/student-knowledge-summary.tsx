import React, { type ReactNode } from "react";
import type { HomeKnowledgeChapter } from "./home-knowledge-matrix";

function averageScore(concepts: Array<{ masteryScore: number | null }>) {
  const scores = concepts
    .map((item) => item.masteryScore)
    .filter((score): score is number => score !== null);
  return scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : null;
}

export function StudentKnowledgeSummary({
  chapters,
  courseName,
  courseSelector,
}: {
  chapters: HomeKnowledgeChapter[];
  courseName?: string | null;
  courseSelector?: ReactNode;
}) {
  const ranked = chapters
    .map((chapter) => ({ ...chapter, score: averageScore(chapter.concepts) }))
    .sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity));
  const evaluated = ranked.filter((chapter) => chapter.score !== null).length;
  return (
    <>
      <header className="st-panel-header flex items-center justify-between gap-2">
        <h2>课程知识掌握</h2>
        {courseSelector ? (
          <div className="st-course-select">{courseSelector}</div>
        ) : null}
      </header>
      {courseName ? <p className="st-knowledge-course">{courseName}</p> : null}
      {ranked.length ? (
        <>
          <ul className="st-chapter-progress">
            {ranked.slice(0, 5).map((chapter) => (
              <li key={chapter.key}>
                <div className="st-chapter-label">
                  <span>{chapter.name}</span>
                  <span
                    className={
                      chapter.score !== null && chapter.score < 60
                        ? "st-danger-text"
                        : "text-muted-foreground"
                    }
                  >
                    {chapter.score === null ? "未评估" : `${chapter.score}%`}
                  </span>
                </div>
                <div
                  className="st-chapter-track"
                  role="img"
                  aria-label={`${chapter.name}：${chapter.score === null ? "证据不足，未评估" : `掌握度 ${chapter.score}%`}`}
                >
                  {chapter.score !== null ? (
                    <span
                      className={chapter.score < 60 ? "is-weak" : ""}
                      style={{ width: `${chapter.score}%` }}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="st-knowledge-note">
            已评估 {evaluated} / {ranked.length}{" "}
            章，优先显示需巩固的章节。未评估表示证据不足，不代表零分。
          </p>
        </>
      ) : (
        <p className="st-panel-empty">
          还没有可用的章节记录。完成作业或练习后，这里会显示知识掌握情况。
        </p>
      )}
    </>
  );
}
