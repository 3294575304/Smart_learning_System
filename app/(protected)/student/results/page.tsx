import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { StudentCourseEvaluationCard } from "@/components/grades/student-course-evaluation-card";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listStudentCourseEvaluationContexts,
  listStudentPublishedCourseGradeResults,
} from "@/services/gradebook/service";
interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
export default async function StudentResultsPage({ searchParams }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  if (raw.view !== "course") {
    const params = new URLSearchParams({ view: "records" });
    for (const key of ["page", "pageSize", "courseId", "classroomId"])
      if (typeof raw[key] === "string") params.set(key, raw[key]);
    redirect(`/student/assignments?${params}`);
  }
  const [allRows, contexts] = await Promise.all([
    listStudentPublishedCourseGradeResults(student.id),
    listStudentCourseEvaluationContexts(student.id),
  ]);
  if (
    raw.courseId !== undefined &&
    (typeof raw.courseId !== "string" ||
      !contexts.some((item) => item.course.id === raw.courseId))
  )
    notFound();
  if (
    raw.classroomId !== undefined &&
    (typeof raw.classroomId !== "string" ||
      !contexts.some(
        (item) =>
          item.classroom.id === raw.classroomId &&
          (!raw.courseId || item.course.id === raw.courseId),
      ))
  )
    notFound();
  const selected = contexts
    .filter(
      (item) =>
        (!raw.courseId || item.course.id === raw.courseId) &&
        (!raw.classroomId || item.classroom.id === raw.classroomId),
    )
    .map((item) => ({ course: item.course, classrooms: [item.classroom] }));
  const rows = allRows.filter(
    (item) =>
      (!raw.courseId || item.course.id === raw.courseId) &&
      (!raw.classroomId || item.classroom.id === raw.classroomId),
  );
  return (
    <section className="space-y-5">
      <PageHeader
        title="课程成绩与评价"
        description="按教学班查看成绩，了解这门课程的学习表现。"
        actions={
          <Link
            className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-600 hover:bg-sky-50"
            href="/student/courses"
          >
            返回我的课程
          </Link>
        }
      />
      {selected.length ? (
        <div className="space-y-5" aria-label="课程成绩与评价">
          {selected.map(({ course, classrooms }) => (
            <StudentCourseEvaluationCard
              key={`${course.id}:${classrooms[0].id}`}
              course={course}
              classrooms={classrooms}
              grades={rows
                .filter((row) => row.course.id === course.id)
                .map((row) => ({
                  id: row.gradebookId,
                  classroomId: row.classroom.id,
                  score: row.result.effectiveScore?.toFixed(2) ?? null,
                  status: row.result.effectiveStatus,
                  publishedAt: row.publication.publishedAt.toISOString(),
                  version: row.publication.versionNumber,
                  components: row.result.componentResultsJson,
                  snapshot: row.result.inputSnapshotJson,
                }))}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border bg-white p-8 text-center">
          <p className="font-medium text-slate-700">暂无课程评价</p>
          <p className="mt-2 text-sm text-slate-500">
            加入课程教学班后，可在这里查看成绩与学习评价。
          </p>
        </div>
      )}
    </section>
  );
}
