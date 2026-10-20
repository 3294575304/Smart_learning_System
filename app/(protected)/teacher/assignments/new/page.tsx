import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { AssignmentForm } from "@/components/assignments/assignment-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherAssignmentEditorOptions } from "@/services/assignments/service";
import { getSystemConfigValue } from "@/services/system-config/service";

export default async function NewAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ classroomId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const [options, defaultDueDays] = await Promise.all([
    getTeacherAssignmentEditorOptions(teacher.id),
    getSystemConfigValue("assignmentDefaultDueDays"),
  ]);
  const classroomId = (await searchParams).classroomId;
  const selectedClassroom = classroomId
    ? options.classrooms.find((item) => item.id === classroomId)
    : null;
  if (classroomId && !selectedClassroom) notFound();
  return (
    <section className="space-y-6">
      <div>
        <TeacherBackLink
          href={
            selectedClassroom?.courseId
              ? `/teacher/courses/${selectedClassroom.courseId}`
              : "/teacher/assignments"
          }
        >
          {selectedClassroom ? "返回课程" : "返回作业管理"}
        </TeacherBackLink>
        <h1 className="mt-2 text-2xl font-semibold">创建作业</h1>
      </div>
      {options.classrooms.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-gray-500">
          请先创建一个有效班级，再创建作业。
        </div>
      ) : (
        <AssignmentForm
          defaultDueDays={defaultDueDays}
          initialClassroomId={selectedClassroom?.id}
          mode="create"
          {...options}
        />
      )}
    </section>
  );
}
