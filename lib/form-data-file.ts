import type { CourseFileUploadFile } from "@/services/course-files/types";

export function formDataFile(
  value: FormDataEntryValue | null,
): CourseFileUploadFile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CourseFileUploadFile>;
  return typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.arrayBuffer === "function"
    ? (candidate as CourseFileUploadFile)
    : null;
}
