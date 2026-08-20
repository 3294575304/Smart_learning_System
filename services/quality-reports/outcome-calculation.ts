import { GradeValueStatus } from "@prisma/client";

import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";

type ReportComponent = QualityReportSourceSnapshot["components"][number];
type ReportStudent = QualityReportSourceSnapshot["students"][number];
type ReportOutcome = QualityReportSourceSnapshot["outcomes"][number];

export interface FormalAssessmentComponent {
  code: string;
  name: string;
  weight: number;
  sortOrder: number;
}

const round = (value: number, places = 4) => Number(value.toFixed(places));

function normalizedLabel(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * Uploaded grade workbooks use stable report codes such as `regular`, while a
 * published assessment scheme can use syllabus codes such as `ASSESS-1`.
 * Resolve the two code systems without relying on array position alone.
 */
export function matchFormalComponentsToReportComponents(
  reportComponents: readonly ReportComponent[],
  formalComponents: readonly FormalAssessmentComponent[],
) {
  const matchedReportCodes = new Set<string>();
  const byFormalCode = new Map<string, string>();

  for (const formal of formalComponents) {
    const exactCode = reportComponents.find(
      (component) =>
        component.code === formal.code &&
        !matchedReportCodes.has(component.code),
    );
    const normalizedName = normalizedLabel(formal.name);
    const exactName = reportComponents.find(
      (component) =>
        normalizedLabel(component.name) === normalizedName &&
        !matchedReportCodes.has(component.code),
    );
    const match = exactCode ?? exactName;
    if (!match || Math.abs(match.weight - formal.weight) > 0.000001) continue;
    matchedReportCodes.add(match.code);
    byFormalCode.set(formal.code, match.code);
  }

  if (
    byFormalCode.size !== formalComponents.length ||
    matchedReportCodes.size !== reportComponents.length
  ) {
    return null;
  }
  return byFormalCode;
}

export function remapOutcomeAllocations(
  outcomes: readonly ReportOutcome[],
  componentCodeMap: ReadonlyMap<string, string>,
): ReportOutcome[] {
  return outcomes.map((outcome) => ({
    ...outcome,
    componentAllocations: (outcome.componentAllocations ?? []).flatMap(
      (allocation) => {
        const componentCode = componentCodeMap.get(allocation.componentCode);
        return componentCode ? [{ ...allocation, componentCode }] : [];
      },
    ),
  }));
}

function studentOutcomeScore(
  student: ReportStudent,
  components: readonly ReportComponent[],
  allocations: ReadonlyMap<string, number>,
) {
  if (student.status !== GradeValueStatus.SCORED) return null;
  const evidence = components.flatMap((component) => {
    const allocationRate = allocations.get(component.code);
    const score = student.componentScores[component.code];
    return allocationRate === undefined || score === null || score === undefined
      ? []
      : [{ component, allocationRate, score }];
  });
  if (evidence.length !== components.length) return null;
  const denominator = evidence.reduce(
    (sum, item) => sum + item.component.weight * item.allocationRate,
    0,
  );
  if (denominator <= 0) return null;
  const numerator = evidence.reduce(
    (sum, item) =>
      sum + item.score * item.component.weight * item.allocationRate,
    0,
  );
  return round(numerator / denominator);
}

/**
 * Produces report-local deterministic outcome evidence for an isolated upload.
 * It never writes back to the formal gradebook or creates a formal attainment
 * version; the immutable report snapshot records the calculation result.
 */
export function calculateUploadedOutcomeAttainment(
  components: readonly ReportComponent[],
  students: readonly ReportStudent[],
  outcomes: readonly ReportOutcome[],
): ReportOutcome[] {
  const componentCodes = new Set(components.map((item) => item.code));
  return outcomes.map((outcome) => {
    const allocations = new Map(
      (outcome.componentAllocations ?? []).map((item) => [
        item.componentCode,
        item.allocationRate,
      ]),
    );
    if (
      allocations.size !== components.length ||
      [...componentCodes].some((code) => !allocations.has(code))
    ) {
      return {
        ...outcome,
        attainmentIndex: null,
        participantCount: 0,
        studentScores: [],
      };
    }
    const studentScores = students.flatMap((student) => {
      const score = studentOutcomeScore(student, components, allocations);
      return score === null ? [] : [score];
    });
    const meanScore = studentScores.length
      ? studentScores.reduce((sum, score) => sum + score, 0) /
        studentScores.length
      : null;
    return {
      ...outcome,
      attainmentIndex: meanScore === null ? null : round(meanScore / 100),
      participantCount: studentScores.length,
      studentScores,
    };
  });
}
