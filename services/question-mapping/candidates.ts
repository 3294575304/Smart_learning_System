function tokens(value: string) {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}_]+/gu)
      .filter((item) => item.length >= 2),
  );
}

export function localQuestionConceptCandidates(
  question: { title: string; content: string; tags: string[] },
  nodes: Array<{
    id: string;
    conceptId: string;
    code: string;
    name: string;
    description: string | null;
  }>,
) {
  const source =
    `${question.title}\n${question.content}\n${question.tags.join(" ")}`.toLocaleLowerCase();
  const sourceTokens = tokens(source);
  return nodes
    .map((node) => {
      const nameMatch = source.includes(node.name.toLocaleLowerCase());
      const codeMatch = source.includes(node.code.toLocaleLowerCase());
      const nodeTokens = tokens(
        `${node.name} ${node.code} ${node.description ?? ""}`,
      );
      const overlap = [...nodeTokens].filter((item) =>
        sourceTokens.has(item),
      ).length;
      const denominator = Math.max(
        1,
        Math.min(sourceTokens.size, nodeTokens.size),
      );
      const overlapRatio = overlap / denominator;
      const confidence = nameMatch
        ? 0.9
        : codeMatch
          ? 0.82
          : Math.min(0.69, 0.3 + overlapRatio * 0.5);
      return {
        conceptId: node.conceptId,
        publishedNodeId: node.id,
        confidence,
        reason: nameMatch
          ? "题目文本直接包含概念名称"
          : codeMatch
            ? "题目文本直接包含概念编码"
            : overlap > 0
              ? `题目与概念描述有 ${overlap} 个关键词重合`
              : "本地降级候选，无直接文本匹配，必须由教师复核",
        score: nameMatch ? 3 : codeMatch ? 2 : overlapRatio,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.confidence - left.confidence ||
        left.conceptId.localeCompare(right.conceptId),
    )
    .slice(0, 3);
}
