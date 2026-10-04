import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { requirePageRole } from "@/services/auth/page-authorization";

export default async function StudentCourseGradesPage() {
  await requirePageRole(Role.STUDENT);
  redirect("/student/results?view=course");
}
