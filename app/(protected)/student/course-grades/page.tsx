import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { requirePageRole } from "@/services/auth/page-authorization";

export default async function StudentCourseGradesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const params = new URLSearchParams({ view: "course" });
  for (const key of ["courseId", "classroomId", "publication", "q"]) {
    const value = raw[key];
    if (Array.isArray(value)) {
      // Preserve malformed duplicates for the destination's strict validation.
      value.forEach((item) => params.append(key, item));
    } else if (value !== undefined) params.set(key, value);
  }
  redirect(`/student/results?${params}`);
}
