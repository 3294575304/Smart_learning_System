import { Prisma } from "@prisma/client";
import { z } from "zod";

const percentageSchema = z
  .union([z.number(), z.string().trim().min(1)])
  .pipe(z.coerce.number().finite().min(0).max(100));

const componentSummarySchema = z.array(
  z.object({
    name: z.string().trim().min(1),
    weight: percentageSchema,
    score: percentageSchema.nullable(),
    status: z.enum(["COMPLETE", "INCOMPLETE", "EXEMPT"]),
  }),
);

function percentageLabel(value: Prisma.Decimal) {
  return `${value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString()}%`;
}

export function presentCourseGradeComponents(value: unknown) {
  const parsed = componentSummarySchema.safeParse(value);
  if (!parsed.success) return [];

  // 未齐的项目仍保留权重，不能把已录入成绩误显示为占满整个总评。
  const includedWeight = parsed.data.reduce(
    (sum, item) => (item.status === "EXEMPT" ? sum : sum.add(item.weight)),
    new Prisma.Decimal(0),
  );

  return parsed.data.map((item) => {
    const weight = new Prisma.Decimal(item.weight);
    const included = item.status !== "EXEMPT" && !includedWeight.isZero();
    const actualWeight = included
      ? weight.div(includedWeight).mul(100)
      : new Prisma.Decimal(0);
    const score =
      item.status === "COMPLETE" && item.score !== null
        ? new Prisma.Decimal(item.score)
        : null;

    return {
      name: item.name,
      status: item.status,
      weight: percentageLabel(weight),
      actualWeight: percentageLabel(actualWeight),
      adjustedWeight: included && !includedWeight.equals(100),
      score: score?.toFixed(2, Prisma.Decimal.ROUND_HALF_UP) ?? null,
      contribution:
        score !== null && included
          ? score
              .mul(weight)
              .div(includedWeight)
              .toFixed(2, Prisma.Decimal.ROUND_HALF_UP)
          : null,
    };
  });
}

export function hasCourseGradeOverride(snapshot: Prisma.JsonValue) {
  return (
    snapshot !== null &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot) &&
    snapshot.override !== null &&
    typeof snapshot.override === "object"
  );
}
