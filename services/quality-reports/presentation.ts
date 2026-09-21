import type { z } from "zod";

import type { qualityReportNarrativeSchema } from "@/services/quality-reports/schemas";

type Narrative = z.infer<typeof qualityReportNarrativeSchema>;

const TEMPLATE_ASSESSMENT_NAMES = new Map([
  ["平时表现", "在线学习"],
  ["课程作业", "在线作业"],
  ["期中考试", "期中机考"],
  ["课程实验", "头歌在线编程（含实验）"],
  ["期末考试", "期末"],
]);

/** Only the fixed template's known labels change; frozen weights stay authoritative. */
export function buildGradeComposition(
  components: ReadonlyArray<{ name: string; weight: number }>,
) {
  return components
    .map(
      ({ name, weight }) =>
        `${TEMPLATE_ASSESSMENT_NAMES.get(name) ?? name}${Number((weight * 100).toFixed(2))}%`,
    )
    .join("+");
}

/** Display numbering follows the frozen syllabus order; relationship codes stay intact. */
export function normalizeQualityReportNarrative<T extends Narrative>(
  narrative: T,
  outcomes: ReadonlyArray<{ code: string }>,
): T {
  const labels = new Map(
    outcomes.map((outcome, index) => [outcome.code.toUpperCase(), index + 1]),
  );
  const display = (text: string) =>
    text.replace(
      /(?:课程目标\s*|目标\s*)?\bOBJ\s*[-‐‑–—－]\s*(\d+)\b/giu,
      (_match, number: string) =>
        `课程目标${labels.get(`OBJ-${number}`) ?? Number(number)}`,
    );
  return {
    ...narrative,
    gradeAnalysis: display(narrative.gradeAnalysis),
    outcomeAnalysis: display(narrative.outcomeAnalysis),
    outcomeDetails: narrative.outcomeDetails.map((detail) => ({
      ...detail,
      analysis: display(detail.analysis),
    })),
    studentEvaluation: display(narrative.studentEvaluation),
    courseSummary: display(narrative.courseSummary),
    improvementMeasures: display(narrative.improvementMeasures),
  };
}
