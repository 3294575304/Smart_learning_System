import Link from "next/link";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listTeacherExams } from "@/services/exams/service";
import { CancelExamButton } from "@/components/exams/cancel-button";
import { notFound } from "next/navigation";
import { teacherExamListSchema } from "@/services/exams/schemas";
import { ResourceNotFoundError } from "@/services/auth/policy";

export default async function TeacherExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; classroomId?: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const scope = teacherExamListSchema.safeParse(await searchParams);
  if (!scope.success) notFound();
  let exams;
  try {
    exams = await listTeacherExams(teacher.id, scope.data);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">考试管理</h1>
          {scope.data.courseId || scope.data.classroomId ? (
            <p className="mt-1 text-sm text-slate-600">
              当前{scope.data.classroomId ? "教学班" : "课程"}考试
              <Link
                className="ms-3 text-sky-700 underline"
                href="/teacher/exams"
              >
                查看全部考试
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Link
            className="rounded border px-4 py-2 text-sky-700"
            href="/teacher/exams/import"
          >
            上传试卷
          </Link>
          <Link
            className="rounded bg-sky-700 px-4 py-2 text-white"
            href="/teacher/exams/new"
          >
            手动组卷
          </Link>
        </div>
      </div>
      {exams.length ? (
        <ul className="space-y-3">
          {exams.map((exam) => (
            <li key={exam.id} className="rounded-xl border bg-white p-4">
              <h2 className="font-semibold">
                {exam.title} · {exam.type === "MIDTERM" ? "期中" : "期末"}
                {exam.cancelledAt ? " · 已取消" : ""}
              </h2>
              <p className="text-sm text-slate-600">
                {exam.startsAt.toLocaleString("zh-CN")} 至{" "}
                {exam.endsAt.toLocaleString("zh-CN")} · 允许切屏{" "}
                {exam.allowedSwitches} 次
              </p>
              <div className="mt-2 flex flex-wrap gap-3">
                {!exam.cancelledAt && (
                  <Link
                    className="text-sky-700 underline"
                    href={`/teacher/exams/${exam.id}`}
                  >
                    查看监考状态
                  </Link>
                )}
                {!exam.cancelledAt && exam.endsAt <= new Date() && (
                  <Link
                    className="text-sky-700 underline"
                    href={`/teacher/exams/${exam.id}/analysis`}
                  >
                    查看考试分析
                  </Link>
                )}
                {exam.assignments.map((assignment) => (
                  <Link
                    className="text-sky-700 underline"
                    key={assignment.id}
                    href={`/teacher/assignments/${assignment.id}?source=exam`}
                  >
                    {assignment.classroom.name}：查看试卷、批改与成绩
                  </Link>
                ))}
                {!exam.cancelledAt && exam.startsAt > new Date() && (
                  <CancelExamButton examId={exam.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border p-8 text-slate-600">
          暂无考试，创建后可按班级查看和批改。
        </p>
      )}
    </section>
  );
}
