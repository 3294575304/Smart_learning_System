import { GradeValueStatus, Prisma } from "@prisma/client";
import { calculateStudentOutcome } from "@/services/outcome-attainment/calculation";

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

export function calculateReportOutcomeScores(
  components: readonly ReportComponent[],
  students: readonly ReportStudent[],
  outcome: ReportOutcome,
  includeSpecialStatuses = false,
) {
  const byCode = new Map(
    components.map((component) => [component.code, component]),
  );
  const allocations = outcome.componentAllocations ?? [];
  if (
    !allocations.length ||
    allocations.some((item) => !byCode.has(item.componentCode))
  )
    return null;
  const mappings = allocations.map((item) => ({
    componentId: item.componentCode,
    componentWeight: new Prisma.Decimal(
      byCode.get(item.componentCode)!.weight,
    ).mul(100),
    allocationRate: new Prisma.Decimal(item.allocationRate).mul(100),
  }));
  return students.flatMap((student) => {
    if (!includeSpecialStatuses && student.status !== GradeValueStatus.SCORED)
      return [];
    const componentScores = components.map((component) => {
      const score = student.componentScores[component.code];
      const status = student.componentStatuses?.[component.code];
      return {
        componentId: component.code,
        status:
          status === "EXEMPT"
            ? ("EXEMPT" as const)
            : status === "INCOMPLETE" || score === null || score === undefined
              ? ("INCOMPLETE" as const)
              : ("COMPLETE" as const),
        score: score === null || score === undefined ? null : String(score),
      };
    });
    const result = calculateStudentOutcome(
      componentScores,
      mappings,
      new Prisma.Decimal(60),
    );
    return result.score === null ? [] : [result.score.toNumber()];
  });
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
  return outcomes.map((outcome) => {
    const studentScores =
      calculateReportOutcomeScores(components, students, outcome) ?? [];
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
