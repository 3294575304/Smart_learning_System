import type { SyllabusParseInput } from "@/services/syllabus-parsing/schemas";

export interface ObjectiveAssessmentMatrix {
  values: number[];
  sourcePages: number[];
}

const MATRIX_HEADING = /课程\s*目标\s*在\s*各\s*考核\s*方式\s*中\s*占比/gu;
const MATRIX_END =
  /各\s*考核\s*方式\s*占\s*总\s*成绩\s*权重|考核\s*方式\s*评分\s*标准/gu;

/**
 * Extracts the row-major objective-by-assessment percentage matrix from the
 * authoritative PDF text. AI still identifies the objective and assessment
 * identities; deterministic extraction protects the numeric calculation path.
 */
export function extractObjectiveAssessmentMatrix(
  pages: readonly SyllabusParseInput["pages"][number][],
  objectiveCount: number,
  assessmentCount: number,
): ObjectiveAssessmentMatrix | null {
  const firstIndex = pages.findIndex((page) => {
    MATRIX_HEADING.lastIndex = 0;
    return MATRIX_HEADING.test(page.text);
  });
  if (firstIndex < 0) return null;

  const relevant = pages.slice(
    firstIndex,
    Math.min(firstIndex + 3, pages.length),
  );
  const endPageIndex = relevant.findIndex((page) => {
    MATRIX_END.lastIndex = 0;
    return MATRIX_END.test(page.text);
  });
  const joined = relevant.map((page) => page.text).join("\n");
  MATRIX_END.lastIndex = 0;
  const end = MATRIX_END.exec(joined)?.index ?? -1;
  const section = end >= 0 ? joined.slice(0, end) : joined;
  const values = [...section.matchAll(/(\d+(?:\.\d+)?)\s*%/gu)].map((match) =>
    Number(match[1]),
  );
  const required = objectiveCount * assessmentCount;
  if (required === 0 || values.length < required) return null;

  const candidate = values.slice(0, required);
  for (
    let assessmentIndex = 0;
    assessmentIndex < assessmentCount;
    assessmentIndex += 1
  ) {
    const total = Array.from(
      { length: objectiveCount },
      (_, objectiveIndex) =>
        candidate[objectiveIndex * assessmentCount + assessmentIndex] ?? 0,
    ).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 100) > 0.000001) return null;
  }

  return {
    values: candidate,
    sourcePages: relevant
      .slice(0, endPageIndex >= 0 ? endPageIndex + 1 : relevant.length)
      .map((page) => page.pageNumber),
  };
}
