import { createHash } from "node:crypto";

export interface MappingCatalogSource {
  id: string;
  creatorId: string;
  title: string;
  content: string;
  type: string;
  difficulty: number;
  visibility: "PRIVATE" | "PUBLIC";
  correctBoolean: boolean | null;
  referenceAnswer: string | null;
  acceptableAnswers: string[];
  isCaseSensitive: boolean;
  gradingConfig: unknown;
  options: Array<{ label: string; content: string; isCorrect: boolean }>;
  programmingConfigRevisions: Array<{ configurationHash: string }>;
  graphBindingSets: Array<{ id: string }>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export function mappingQuestionFingerprint(question: MappingCatalogSource) {
  // 标题和来源标签可在复制后改名；题干、答案、选项和判题配置必须一致才去重。
  // 保留代码中的空白，不能把缩进不同的编程题误认为同题。
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          content: question.content.replace(/\r\n?/gu, "\n").trim(),
          type: question.type,
          correctBoolean: question.correctBoolean,
          referenceAnswer: question.referenceAnswer,
          acceptableAnswers: [...question.acceptableAnswers].sort(),
          isCaseSensitive: question.isCaseSensitive,
          gradingConfig: question.gradingConfig,
          options: [...question.options].sort((a, b) =>
            a.label.localeCompare(b.label),
          ),
          programmingConfiguration:
            question.programmingConfigRevisions[0]?.configurationHash ?? null,
        }),
      ),
    )
    .digest("hex");
}

export function buildMappingQuestionCatalog(
  teacherId: string,
  questions: MappingCatalogSource[],
) {
  const groups = new Map<string, MappingCatalogSource[]>();
  for (const question of questions) {
    const key = mappingQuestionFingerprint(question);
    const group = groups.get(key) ?? [];
    group.push(question);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((group) => {
    const representative =
      group.find((q) => q.creatorId === teacherId) ?? group[0];
    if (!representative) return [];
    const managed =
      group.find(
        (q) => q.creatorId === teacherId && q.graphBindingSets.length,
      ) ?? group.find((q) => q.graphBindingSets.length);
    return [
      {
        id: representative.id,
        title: representative.title,
        type: representative.type,
        difficulty: representative.difficulty,
        visibility: representative.visibility,
        isOwn: representative.creatorId === teacherId,
        hasPublic: group.some((q) => q.visibility === "PUBLIC"),
        isBound: Boolean(managed),
        bindingQuestionId: managed?.id ?? representative.id,
        duplicateCount: group.length - 1,
      },
    ];
  });
}
