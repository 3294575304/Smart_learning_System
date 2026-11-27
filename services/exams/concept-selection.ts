export const maxExamConcepts = 200;

export function examConceptIndex(
  ordinal: number,
  topics: number,
  questions: number,
) {
  return topics > questions
    ? Math.floor(((ordinal - 0.5) * topics) / questions)
    : (ordinal - 1) % topics;
}

export function toggleChapterConcepts(
  selectedIds: string[],
  chapterIds: string[],
  limit: number,
): { ids: string[]; exceeded: boolean } {
  const chapter = new Set(chapterIds);
  if (!chapter.size) return { ids: selectedIds, exceeded: false };
  if ([...chapter].every((id) => selectedIds.includes(id))) {
    return {
      ids: selectedIds.filter((id) => !chapter.has(id)),
      exceeded: false,
    };
  }
  const ids = [...new Set([...selectedIds, ...chapter])];
  return ids.length > limit
    ? { ids: selectedIds, exceeded: true }
    : { ids, exceeded: false };
}
