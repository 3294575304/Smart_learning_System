import type {
  StudentAnalysisInput,
  StudentAnalysisOutput,
} from "@/services/ai/schemas";

interface KnowledgePointStats {
  correct: number;
  total: number;
}

function overallLevel(accuracy: number): StudentAnalysisOutput["overallLevel"] {
  if (accuracy >= 0.9) return "ADVANCED";
  if (accuracy >= 0.75) return "INTERMEDIATE";
  if (accuracy >= 0.6) return "BASIC";
  return "BEGINNER";
}

function weaknessSeverity(accuracy: number): number {
  if (accuracy < 0.2) return 5;
  if (accuracy < 0.35) return 4;
  if (accuracy < 0.5) return 3;
  if (accuracy < 0.6) return 2;
  return 1;
}

function recommendedDifficulty(
  accuracy: number,
  currentAverageDifficulty: number,
): number {
  const adjustment = accuracy >= 0.85 ? 1 : accuracy < 0.6 ? -1 : 0;
  return Math.max(
    1,
    Math.min(5, Math.round(currentAverageDifficulty) + adjustment),
  );
}

export function generateRuleBasedAnalysis(
  input: StudentAnalysisInput,
): StudentAnalysisOutput {
  const knowledgePointStats = new Map<string, KnowledgePointStats>();
  let correctAnswers = 0;
  let difficultyTotal = 0;

  for (const answer of input.answers) {
    if (answer.isCorrect) correctAnswers += 1;
    difficultyTotal += answer.difficulty;
    for (const knowledgePointId of answer.knowledgePointIds) {
      const current = knowledgePointStats.get(knowledgePointId) ?? {
        correct: 0,
        total: 0,
      };
      current.total += 1;
      if (answer.isCorrect) current.correct += 1;
      knowledgePointStats.set(knowledgePointId, current);
    }
  }

  for (const history of input.historicalKnowledgePointAccuracy) {
    if (!knowledgePointStats.has(history.knowledgePointId)) {
      knowledgePointStats.set(history.knowledgePointId, {
        correct: history.correctCount,
        total: history.answeredCount,
      });
    }
  }

  const accuracy = correctAnswers / input.answers.length;
  const masteredKnowledgePoints: StudentAnalysisOutput["masteredKnowledgePoints"] =
    [];
  const weakKnowledgePoints: StudentAnalysisOutput["weakKnowledgePoints"] = [];

  for (const [knowledgePointId, stats] of [...knowledgePointStats].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (stats.total === 0) continue;
    const pointAccuracy = stats.correct / stats.total;
    const percentage = Math.round(pointAccuracy * 100);
    if (pointAccuracy >= 0.8) {
      masteredKnowledgePoints.push({
        knowledgePointId,
        reason: `该知识点正确率为 ${percentage}%（${stats.correct}/${stats.total}）。`,
      });
    } else if (pointAccuracy < 0.6) {
      weakKnowledgePoints.push({
        knowledgePointId,
        severity: weaknessSeverity(pointAccuracy),
        reason: `该知识点正确率为 ${percentage}%（${stats.correct}/${stats.total}），需要巩固。`,
      });
    }
  }

  weakKnowledgePoints.sort(
    (left, right) =>
      right.severity - left.severity ||
      left.knowledgePointId.localeCompare(right.knowledgePointId),
  );

  const wrongCount = input.answers.length - correctAnswers;
  const suggestions = weakKnowledgePoints
    .slice(0, 3)
    .map(
      (item) =>
        `优先复习知识点 ${item.knowledgePointId}，完成基础例题后再做同难度练习。`,
    );
  if (suggestions.length === 0) {
    suggestions.push("保持当前练习节奏，并通过间隔复习巩固已掌握知识点。");
  }

  return {
    overallLevel: overallLevel(accuracy),
    masteredKnowledgePoints,
    weakKnowledgePoints,
    errorPatterns:
      wrongCount > 0
        ? [
            {
              type: "UNKNOWN",
              evidence: `本批次共有 ${wrongCount} 道错题；规则分析无法可靠区分概念、计算、粗心或方法错误。`,
            },
          ]
        : [],
    suggestions,
    recommendedDifficulty: recommendedDifficulty(
      accuracy,
      difficultyTotal / input.answers.length,
    ),
    confidence: Math.min(
      0.78,
      Number((0.35 + Math.min(input.answers.length, 10) * 0.035).toFixed(2)),
    ),
  };
}
