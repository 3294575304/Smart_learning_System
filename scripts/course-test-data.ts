import { createHash } from "node:crypto";
import { AssessmentComponentType, AttendanceStatus } from "@prisma/client";

export const TEST_DATA_VERSION = "course-test-data-v1";
export const TEST_DATA_LABEL = "【测试数据】";

function randomUnit(key: string): number {
  return createHash("sha256").update(key).digest().readUInt32BE(0) / 2 ** 32;
}

export function testDataId(key: string): string {
  return `c${createHash("sha256").update(`${TEST_DATA_VERSION}:${key}`).digest("hex").slice(0, 24)}`;
}

export function studentTestData(studentId: string) {
  const ability = 45 + randomUnit(`${studentId}:ability`) * 48;
  const attendance = Array.from({ length: 24 }, (_, index) => {
    const value = randomUnit(`${studentId}:attendance:${index}`);
    if (value < 0.035) return AttendanceStatus.ABSENT;
    if (value < 0.065) return AttendanceStatus.LEAVE;
    if (value < 0.095) return AttendanceStatus.EARLY_LEAVE;
    if (value < 0.16) return AttendanceStatus.LATE;
    return AttendanceStatus.PRESENT;
  });
  const score = (kind: string, index: number, bonus: number) =>
    Number(
      Math.max(
        0,
        Math.min(
          100,
          ability +
            bonus +
            (randomUnit(`${studentId}:${kind}:${index}`) - 0.5) * 22,
        ),
      ).toFixed(1),
    );
  return {
    attendance,
    experiments: Array.from({ length: 8 }, (_, i) => score("experiment", i, 6)),
    assignments: Array.from({ length: 8 }, (_, i) => score("assignment", i, 8)),
    midterm: score("midterm", 0, 0),
    final: score("final", 0, 2),
  };
}

export const gradeDefinitions = [
  {
    type: AssessmentComponentType.REGULAR_PERFORMANCE,
    key: "attendance",
    name: "24 次课考勤汇总",
    index: 0,
  },
  ...Array.from({ length: 8 }, (_, index) => ({
    type: AssessmentComponentType.COURSE_EXPERIMENT,
    key: `experiment-${index + 1}`,
    name: `实验 ${index + 1}`,
    index,
  })),
  ...Array.from({ length: 8 }, (_, index) => ({
    type: AssessmentComponentType.COURSE_ASSIGNMENT,
    key: `assignment-${index + 1}`,
    name: `作业 ${index + 1}`,
    index,
  })),
  {
    type: AssessmentComponentType.MIDTERM_EXAM,
    key: "midterm",
    name: "期中考试",
    index: 0,
  },
  {
    type: AssessmentComponentType.FINAL_EXAM,
    key: "final",
    name: "期末考试",
    index: 0,
  },
];

export function classDates(startDate: string): Date[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate))
    throw new Error("上课日期格式必须为 YYYY-MM-DD");
  const first = new Date(`${startDate}T08:00:00+08:00`);
  if (
    !Number.isFinite(first.getTime()) ||
    first.toISOString().slice(0, 10) !== startDate
  )
    throw new Error("上课日期无效");
  return Array.from(
    { length: 24 },
    (_, i) =>
      new Date(
        first.getTime() + (Math.floor(i / 2) * 7 + (i % 2) * 3) * 86400000,
      ),
  );
}
