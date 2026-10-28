import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { StudentCourseEvaluationCard } from "@/components/grades/student-course-evaluation-card";
import { StudentGradeFilters } from "@/components/grades/student-grade-filters";
import { StudentCourseReturnLink } from "@/components/dashboard/student-course-return-link";
import { filterStudentGradeCards } from "@/services/gradebook/student-card-filters";
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
  // A later edit to a gradebook must not select an older publication.
  const rows = [...allRows].sort(
    (a, b) =>
      b.publication.publishedAt.getTime() -
        a.publication.publishedAt.getTime() ||
      b.publication.versionNumber - a.publication.versionNumber ||
      a.gradebookId.localeCompare(b.gradebookId),
  );
  const filters = (() => {
    try {
      return filterStudentGradeCards(
        contexts,
        raw,
        new Set(rows.map((row) => row.classroom.id)),
      );
    } catch {
      notFound();
    }
  })();
  const selected = filters.items;
  return (
    <section className="space-y-5">
      <PageHeader
        title="课程总评"
        description="每门已加入的课程分别查看总评，同名课程也独立显示。"
        actions={
          <StudentCourseReturnLink
            courseId={filters.courseId}
            classroomId={filters.classroomId}
          />
        }
      />
      <StudentGradeFilters
        key={`${filters.courseId}:${filters.classroomId}:${filters.publication}:${filters.q}`}
        contexts={contexts}
        {...filters}
      />
      {filters.selectionRequired ? (
        <p
          role="status"
          className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-800"
        >
          旧链接对应多门课程，请在上方选择具体课程，或明确选择“全部课程”。
        </p>
      ) : (
        <p className="text-sm text-slate-500" role="status">
          当前范围 {filters.total} 门课程 · 已发布 {filters.published} · 待发布{" "}
          {filters.pending}
          <span className="ml-2 text-slate-400">显示 {selected.length} 项</span>
        </p>
      )}
      {selected.length ? (
        <div
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label="课程总评卡片"
        >
          {selected.map(({ course, classroom }) => (
            <StudentCourseEvaluationCard
              key={`${course.id}:${classroom.id}`}
              course={course}
              classrooms={[classroom]}
              grades={rows
                .filter(
                  (row) =>
                    row.course.id === course.id &&
                    row.classroom.id === classroom.id,
                )
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
          <p className="font-medium text-slate-700">
            {filters.selectionRequired
              ? "请选择具体课程"
              : contexts.length
                ? "没有符合条件的课程总评"
                : "暂无课程总评"}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {contexts.length
              ? "请调整课程、发布状态或搜索条件。"
              : "加入课程教学班后，可在这里查看成绩与学习评价。"}
          </p>
          {contexts.length > 0 && (
            <Link
              className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-sky-200 px-4 text-sm text-sky-700"
              href="/student/results?view=course"
            >
              清除筛选
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
