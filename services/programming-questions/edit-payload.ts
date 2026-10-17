import type { ProgrammingConfigRevisionInput } from "@/services/programming-questions/schemas";

// Read DTOs also carry database IDs. Only editable fields belong to a new revision request.
export function programmingCasesForSave(
  cases: ProgrammingConfigRevisionInput["testCases"],
) {
  return cases.map((item, index) => ({
    visibility: item.visibility,
    name: item.name,
    stdin: item.stdin,
    expectedOutput: item.expectedOutput,
    points: Number(item.points),
    sortOrder: index + 1,
  }));
}
