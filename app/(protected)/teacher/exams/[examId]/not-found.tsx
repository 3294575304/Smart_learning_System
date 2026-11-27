import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";

export default function ExamNotFound() {
  return (
    <section className="space-y-4">
      <TeacherBackLink href="/teacher/exams">返回考试管理</TeacherBackLink>
      <div className="rounded-xl border bg-white p-5">
        <h1 className="text-lg font-semibold">找不到此考试页面</h1>
        <p className="mt-2 text-sm text-slate-600">
          请从考试管理重新选择场次和教学班。
        </p>
      </div>
    </section>
  );
}
