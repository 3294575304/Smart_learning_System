import type { ExamType } from "@prisma/client";

export const examTypeLabels = {
  MIDTERM: "期中考试",
  FINAL: "期末考试",
  REGULAR: "平时考试",
} satisfies Record<ExamType, string>;

export function examTypeLabel(type?: string | null) {
  return type && Object.hasOwn(examTypeLabels, type)
    ? examTypeLabels[type as keyof typeof examTypeLabels]
    : "课程考试";
}
