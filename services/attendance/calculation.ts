import { AttendanceStatus, Prisma } from "@prisma/client";

const credit: Record<AttendanceStatus, Prisma.Decimal | null> = {
  PRESENT: new Prisma.Decimal(1),
  LATE: new Prisma.Decimal("0.8"),
  EARLY_LEAVE: new Prisma.Decimal("0.8"),
  ABSENT: new Prisma.Decimal(0),
  LEAVE: null,
  PENDING: null,
};

export function calculateAttendanceRate(statuses: AttendanceStatus[]) {
  const included = statuses
    .map((status) => credit[status])
    .filter((value): value is Prisma.Decimal => value !== null);
  if (!included.length) return { denominator: 0, earned: "0.0000", rate: null };
  const earned = included.reduce(
    (sum, value) => sum.add(value),
    new Prisma.Decimal(0),
  );
  return {
    denominator: included.length,
    earned: earned.toFixed(4),
    rate: earned
      .div(included.length)
      .mul(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(2),
  };
}
