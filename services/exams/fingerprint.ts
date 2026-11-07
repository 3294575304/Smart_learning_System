import { createHash } from "node:crypto";
type Question = {
  type: string;
  content: string;
  options: Array<{ content: string; isCorrect: boolean; sortOrder: number }>;
  correctBoolean: boolean | null;
  referenceAnswer: string | null;
  acceptableAnswers: string[];
};
const normalize = (value: string | null) =>
  (value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();

export function examQuestionHash(question: Question): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        question.type,
        normalize(question.content),
        [...question.options]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => [normalize(item.content), item.isCorrect]),
        question.correctBoolean,
        normalize(question.referenceAnswer),
        question.acceptableAnswers.map(normalize).sort(),
      ]),
    )
    .digest("hex");
}

export function plusThreeYears(date: Date): Date {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + 3);
  return result;
}

export function overlapsThreeYears(a: Date, b: Date): boolean {
  return a < plusThreeYears(b) && b < plusThreeYears(a);
}
