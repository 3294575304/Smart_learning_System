import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { StudentAttendanceView } from "@/components/attendance/student-attendance-view";
import { StudentAssignmentListBackLink } from "@/components/assignments/student-assignment-list-back-link";
import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import { attendanceSessionIdSchema } from "@/services/attendance/schemas";
import { getStudentAttendanceSession } from "@/services/attendance/service";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";

export default async function StudentAttendanceSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const sessionId = attendanceSessionIdSchema.safeParse(
    (await params).sessionId,
  );
  if (!sessionId.success) notFound();
  let record: Awaited<ReturnType<typeof getStudentAttendanceSession>>;
  try {
    record = await getStudentAttendanceSession(student.id, sessionId.data);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const scope = {
    courseId: record.session.course.id,
    classroomId: record.session.classroom.id,
  };
  return (
    <section className="space-y-4">
      <StudentAssignmentListBackLink scope={scope} />
      <StudentPageHeader
        title="课堂签到"
        eyebrow={record.session.course.name}
        description={`${record.session.classroom.name} · 查看本次签到安排、完成签到与查看状态。`}
      />
      <StudentAttendanceView
        initialRecords={[record]}
        sessionId={sessionId.data}
        {...scope}
      />
    </section>
  );
}
