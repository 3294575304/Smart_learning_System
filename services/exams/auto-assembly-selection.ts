import { QuestionType } from "@prisma/client";

export interface ExamAssemblyCandidate {
  id: string;
  title: string;
  type: QuestionType;
  hash: string;
  conceptIds: string[];
}

export function selectExamAssemblyCandidates(
  candidates: ExamAssemblyCandidate[],
  conceptIds: string[],
  counts: Partial<Record<QuestionType, number>>,
  excludedHashes: Set<string>,
) {
  const usedHashes = new Set(excludedHashes);
  const coverage = new Map(conceptIds.map((id) => [id, 0]));
  const selected: ExamAssemblyCandidate[] = [];
  const shortages: Array<{
    type: QuestionType;
    requested: number;
    found: number;
  }> = [];

  for (const type of Object.values(QuestionType)) {
    const requested = counts[type] ?? 0;
    let found = 0;
    const pool = candidates.filter(
      (item) => item.type === type && item.conceptIds.length,
    );
    while (found < requested) {
      const available = pool.filter((item) => !usedHashes.has(item.hash));
      if (!available.length) break;
      available.sort((a, b) => {
        const score = (item: ExamAssemblyCandidate) =>
          Math.min(...item.conceptIds.map((id) => coverage.get(id) ?? 0));
        return score(a) - score(b) || a.id.localeCompare(b.id);
      });
      const chosen = available[0];
      usedHashes.add(chosen.hash);
      for (const id of chosen.conceptIds)
        coverage.set(id, (coverage.get(id) ?? 0) + 1);
      selected.push(chosen);
      found += 1;
    }
    if (found < requested) shortages.push({ type, requested, found });
  }
  return { selected, shortages, coverage: Object.fromEntries(coverage) };
}
