import type { z } from "zod";

import type { qualityReportNarrativeSchema } from "@/services/quality-reports/schemas";

type Narrative = z.infer<typeof qualityReportNarrativeSchema>;

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
