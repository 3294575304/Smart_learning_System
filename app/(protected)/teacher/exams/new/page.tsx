import { Role } from "@prisma/client";
import Link from "next/link";
import { Upload } from "lucide-react";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherAssignmentEditorOptions } from "@/services/assignments/service";
import { ExamForm } from "@/components/exams/exam-form";
import { listExamCourseObjectives } from "@/services/exams/service";

export default async function NewExamPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const [options, courseObjectives] = await Promise.all([
    getTeacherAssignmentEditorOptions(teacher.id),
    listExamCourseObjectives(teacher.id),
  ]);
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <TeacherBackLink href="/teacher/exams">返回考试管理</TeacherBackLink>
          <h1 className="text-2xl font-semibold text-slate-950">新建考试</h1>
        </div>
        <Link
          href="/teacher/exams/import"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 bg-white px-3.5 text-sm font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        >
          <Upload aria-hidden="true" className="size-4" />
          上传试卷
        </Link>
      </header>
      <ExamForm
        courses={options.publicationCourses}
        classrooms={options.classrooms}
        conceptGroups={options.courses}
        assemblyChapters={options.assemblyChapters}
        courseObjectives={courseObjectives}
      />
    </section>
  );
}
