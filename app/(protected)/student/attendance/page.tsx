import { Role } from "@prisma/client";
import { StudentAttendanceView } from "@/components/attendance/student-attendance-view";
import { PageHeader } from "@/components/dashboard/page-header";
import { getStudentAttendance } from "@/services/attendance/service";
import { requirePageRole } from "@/services/auth/page-authorization";
export default async function StudentAttendancePage() {
  const student = await requirePageRole(Role.STUDENT);
  const data = await getStudentAttendance(student.id);
  return (
    <section className="space-y-6">
      <PageHeader
        title="我的出勤"
        description="查看自己的签到结果、教师纠正记录和可解释出勤率。"
      />
      <StudentAttendanceView
        initialRecords={data.records}
        rate={data.summary.rate}
        denominator={data.summary.denominator}
      />
    </section>
  );
}
