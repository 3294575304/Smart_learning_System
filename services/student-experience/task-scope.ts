import { z } from "zod";

import { courseIdSchema } from "@/services/courses/schemas";

export const studentTaskScopeSchema = z.object({
  courseId: courseIdSchema.optional(),
  classroomId: courseIdSchema.optional(),
});

export type StudentTaskScope = z.infer<typeof studentTaskScopeSchema>;

export function studentTaskHref(path: string, scope: StudentTaskScope) {
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  if (scope.courseId) params.set("courseId", scope.courseId);
  if (scope.classroomId) params.set("classroomId", scope.classroomId);
  return `${pathname}${params.size ? `?${params}` : ""}`;
}
