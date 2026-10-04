export type KnowledgePointLabels = Record<string, string>;

export function knowledgePointLabel(
  knowledgePointId: string,
  labels: KnowledgePointLabels,
) {
  return labels[knowledgePointId] ?? "未命名知识点";
}

export function localizeKnowledgePointReferences(
  text: string,
  labels: KnowledgePointLabels,
) {
  return Object.entries(labels)
    .sort(([left], [right]) => right.length - left.length)
    .reduce(
      (localized, [knowledgePointId, label]) =>
        localized.replaceAll(knowledgePointId, label),
      text,
    );
}
