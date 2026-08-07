import {
  CourseGradeCalculationStatus,
  GradeValueStatus,
  Prisma,
} from "@prisma/client";

export interface GradeCalculationEntry {
  revisionId: string | null;
  gradeItemId: string;
  itemName: string;
  itemWeight: Prisma.Decimal;
  maxScore: Prisma.Decimal;
  status: GradeValueStatus;
  score: Prisma.Decimal | null;
}

export interface GradeCalculationComponent {
  componentId: string;
  code: string;
  name: string;
  weight: Prisma.Decimal;
  entries: GradeCalculationEntry[];
}

export interface FinalGradeOverrideInput {
  revisionId: string;
  status: GradeValueStatus;
  score: Prisma.Decimal | null;
}

export interface CourseGradeCalculationResult {
  status: CourseGradeCalculationStatus;
  calculatedScore: Prisma.Decimal | null;
  effectiveStatus: GradeValueStatus;
  effectiveScore: Prisma.Decimal | null;
  componentResults: Array<{
    componentId: string;
    code: string;
    name: string;
    status: "COMPLETE" | "INCOMPLETE" | "EXEMPT";
    score: string | null;
    weight: string;
    evidence: Array<{
      revisionId: string | null;
      gradeItemId: string;
      itemName: string;
      status: GradeValueStatus;
      score: string | null;
      maxScore: string;
      itemWeight: string;
    }>;
  }>;
}

const ZERO_STATUSES = new Set<GradeValueStatus>([
  GradeValueStatus.ABSENT,
  GradeValueStatus.CHEATING,
]);

function normalizedEntryScore(entry: GradeCalculationEntry) {
  if (entry.status === GradeValueStatus.SCORED && entry.score !== null) {
    return entry.score
      .div(entry.maxScore)
      .mul(100)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  }
  if (ZERO_STATUSES.has(entry.status)) return new Prisma.Decimal(0);
  return null;
}

export function calculateCourseGrade(
  components: GradeCalculationComponent[],
  override: FinalGradeOverrideInput | null,
): CourseGradeCalculationResult {
  const componentResults: CourseGradeCalculationResult["componentResults"] = [];
  let hasIncomplete = false;
  let courseNumerator = new Prisma.Decimal(0);
  let courseDenominator = new Prisma.Decimal(0);

  for (const component of components) {
    const evidence = component.entries.map((entry) => ({
      revisionId: entry.revisionId,
      gradeItemId: entry.gradeItemId,
      itemName: entry.itemName,
      status: entry.status,
      score: entry.score?.toFixed(4) ?? null,
      maxScore: entry.maxScore.toFixed(4),
      itemWeight: entry.itemWeight.toFixed(4),
    }));
    if (component.entries.length === 0) {
      hasIncomplete = true;
      componentResults.push({
        componentId: component.componentId,
        code: component.code,
        name: component.name,
        status: "INCOMPLETE",
        score: null,
        weight: component.weight.toFixed(4),
        evidence,
      });
      continue;
    }
    const included = component.entries.filter(
      (entry) => entry.status !== GradeValueStatus.EXEMPT,
    );
    if (included.length === 0) {
      componentResults.push({
        componentId: component.componentId,
        code: component.code,
        name: component.name,
        status: "EXEMPT",
        score: null,
        weight: component.weight.toFixed(4),
        evidence,
      });
      continue;
    }
    const normalized = included.map((entry) => ({
      entry,
      score: normalizedEntryScore(entry),
    }));
    if (normalized.some((item) => item.score === null)) {
      hasIncomplete = true;
      componentResults.push({
        componentId: component.componentId,
        code: component.code,
        name: component.name,
        status: "INCOMPLETE",
        score: null,
        weight: component.weight.toFixed(4),
        evidence,
      });
      continue;
    }
    const itemDenominator = included.reduce(
      (sum, entry) => sum.add(entry.itemWeight),
      new Prisma.Decimal(0),
    );
    const itemNumerator = normalized.reduce(
      (sum, item) => sum.add(item.score!.mul(item.entry.itemWeight)),
      new Prisma.Decimal(0),
    );
    const componentScore = itemNumerator
      .div(itemDenominator)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    courseNumerator = courseNumerator.add(componentScore.mul(component.weight));
    courseDenominator = courseDenominator.add(component.weight);
    componentResults.push({
      componentId: component.componentId,
      code: component.code,
      name: component.name,
      status: "COMPLETE",
      score: componentScore.toFixed(4),
      weight: component.weight.toFixed(4),
      evidence,
    });
  }

  const allExempt =
    components.length > 0 &&
    componentResults.every((item) => item.status === "EXEMPT");
  const status = allExempt
    ? CourseGradeCalculationStatus.EXEMPT
    : hasIncomplete || courseDenominator.isZero()
      ? CourseGradeCalculationStatus.INCOMPLETE
      : CourseGradeCalculationStatus.COMPLETE;
  const calculatedScore =
    status === CourseGradeCalculationStatus.COMPLETE
      ? courseNumerator
          .div(courseDenominator)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : null;
  const effectiveStatus = override
    ? override.status
    : status === CourseGradeCalculationStatus.COMPLETE
      ? GradeValueStatus.SCORED
      : status === CourseGradeCalculationStatus.EXEMPT
        ? GradeValueStatus.EXEMPT
        : GradeValueStatus.NOT_ENTERED;
  const effectiveScore = override ? override.score : calculatedScore;

  return {
    status,
    calculatedScore,
    effectiveStatus,
    effectiveScore,
    componentResults,
  };
}
