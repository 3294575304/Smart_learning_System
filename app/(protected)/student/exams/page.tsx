import Link from "next/link";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentExams } from "@/services/exams/service";

export default async function StudentExamsPage() {
  const student = await requirePageRole(Role.STUDENT);
  const exams = await listStudentExams(student.id);
  const now = new Date();
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">我的考试</h1>
      {exams.length ? (
        <ul className="space-y-3">
          {exams.map((exam) => (
            <li key={exam.id} className="rounded-xl border bg-white p-4">
              <h2 className="font-semibold">
                {exam.title} · {exam.type === "MIDTERM" ? "期中" : "期末"}
              </h2>
              <p className="text-sm text-slate-600">
                {exam.startsAt.toLocaleString("zh-CN")} 至{" "}
                {exam.endsAt.toLocaleString("zh-CN")}
              </p>
              <p className="text-sm">
                {now < exam.startsAt
                  ? "尚未开考"
                  : now >= exam.endsAt
                    ? "已截止"
                    : "正在进行"}
              </p>
              {exam.assignments.map((assignment) => (
                <Link
                  className="mr-3 text-sky-700 underline"
                  key={assignment.id}
                  href={`/student/assignments/${assignment.id}`}
                >
                  {assignment.classroom.name}：进入考试
                </Link>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border p-8 text-slate-600">暂无考试。</p>
      )}
    </section>
  );
}
