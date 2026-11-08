export interface ScoreStats {
  count: number;
  average: number | null;
  median: number | null;
  standardDeviation: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
  excellentRate: number | null;
  bands: number[];
}

export function percent(numerator: number, denominator: number): number | null {
  return denominator > 0
    ? Math.round((numerator / denominator) * 1000) / 10
    : null;
}

export function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function scoreStats(
  scores: number[],
  thresholds: { pass: number; excellent: number },
): ScoreStats {
  const sorted = [...scores].sort((a, b) => a - b);
  const count = sorted.length;
  if (!count)
    return {
      count: 0,
      average: null,
      median: null,
      standardDeviation: null,
      highest: null,
      lowest: null,
      passRate: null,
      excellentRate: null,
      bands: [0, 0, 0, 0, 0],
    };
  const mean = scores.reduce((sum, score) => sum + score, 0) / count;
  const variance =
    scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / count;
  const middle = Math.floor(count / 2);
  const bands = [0, 0, 0, 0, 0];
  for (const score of scores)
    bands[Math.min(4, Math.max(0, Math.floor(score / 10) - 5))] += 1;
  return {
    count,
    average: oneDecimal(mean),
    median: oneDecimal(
      count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    ),
    standardDeviation: oneDecimal(Math.sqrt(variance)),
    highest: oneDecimal(sorted[count - 1]),
    lowest: oneDecimal(sorted[0]),
    passRate: percent(
      scores.filter((score) => score >= thresholds.pass).length,
      count,
    ),
    excellentRate: percent(
      scores.filter((score) => score >= thresholds.excellent).length,
      count,
    ),
    bands,
  };
}

/** Internal consistency for a complete, binary-scored objective paper. */
export function kr20(rows: number[][]): number | null {
  const students = rows.length;
  const items = rows[0]?.length ?? 0;
  if (
    students < 2 ||
    items < 10 ||
    rows.some(
      (row) => row.length !== items || row.some((v) => v !== 0 && v !== 1),
    )
  )
    return null;
  const totals = rows.map((row) => row.reduce((sum, item) => sum + item, 0));
  const mean = totals.reduce((sum, total) => sum + total, 0) / students;
  const variance =
    totals.reduce((sum, total) => sum + (total - mean) ** 2, 0) / students;
  if (variance === 0) return null;
  const pq = Array.from({ length: items }, (_, index) => {
    const p = rows.reduce((sum, row) => sum + row[index], 0) / students;
    return p * (1 - p);
  }).reduce((sum, value) => sum + value, 0);
  return Math.round((items / (items - 1)) * (1 - pq / variance) * 100) / 100;
}
