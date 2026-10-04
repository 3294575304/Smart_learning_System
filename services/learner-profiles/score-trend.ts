export interface ScoredSession {
  id: string;
  occurredAt: Date;
  title: string;
  source: "正式作业" | "整组练习";
  score: number | null;
  maxScore: number | null;
  percentage?: number | null;
}

/** Each entry is a whole published submission or fully graded practice group. */
export function buildScoreTrend(sessions: ScoredSession[]) {
  return [...new Map(sessions.map((session) => [session.id, session])).values()]
    .filter(
      (session) =>
        session.score !== null &&
        Number.isFinite(session.score) &&
        session.maxScore !== null &&
        Number.isFinite(session.maxScore) &&
        session.maxScore > 0 &&
        session.score >= 0 &&
        session.score <= session.maxScore &&
        (session.percentage == null ||
          (Number.isFinite(session.percentage) &&
            session.percentage >= 0 &&
            session.percentage <= 100)),
    )
    .sort(
      (a, b) =>
        a.occurredAt.getTime() - b.occurredAt.getTime() ||
        a.id.localeCompare(b.id),
    )
    .slice(-8)
    .flatMap((session) =>
      session.score === null || session.maxScore === null
        ? []
        : [
            {
              id: session.id,
              occurredAt: session.occurredAt,
              // Preserve the published precision; derived rates are truncated to two decimals.
              value:
                session.percentage ??
                Math.trunc((session.score * 10000) / session.maxScore) / 100,
              source: session.source,
              detail: `${session.source} · ${session.title} · ${session.score}/${session.maxScore} 分 · ${session.occurredAt.toLocaleString("zh-CN")}`,
            },
          ],
    );
}
