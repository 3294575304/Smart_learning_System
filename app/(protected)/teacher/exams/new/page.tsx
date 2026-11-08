import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherAssignmentEditorOptions } from "@/services/assignments/service";
import { ExamForm } from "@/components/exams/exam-form";
import { listExamCourseObjectives } from "@/services/exams/service";

export default async function NewExamPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const options = await getTeacherAssignmentEditorOptions(teacher.id);
  const courseObjectives = await listExamCourseObjectives(teacher.id);
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">创建考试</h1>
      <ExamForm
        courses={options.publicationCourses}
        classrooms={options.classrooms}
        conceptGroups={options.courses}
        courseObjectives={courseObjectives}
      />
    </section>
  );
}
