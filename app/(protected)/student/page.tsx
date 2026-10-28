import { Role } from "@prisma/client";
import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { StudentHomeView } from "@/components/dashboard/student-home-view";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";

export default async function StudentPage() {
  const student = await requirePageRole(Role.STUDENT);
  const overview = await getStudentTaskOverview(student.id);
  return (
    <>
      <SurveyAvailabilityRefresh at={overview.nextChangeAt?.toISOString()} />
      <StudentHomeView
        name={student.displayName ?? "同学"}
        overview={overview}
      />
    </>
  );
}
