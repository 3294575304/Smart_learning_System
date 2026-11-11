import Link from "next/link";
import { Role } from "@prisma/client";
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Plus,
  Upload,
} from "lucide-react";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listTeacherExams } from "@/services/exams/service";
import { CancelExamButton } from "@/components/exams/cancel-button";
import { notFound, redirect } from "next/navigation";
import {
  teacherExamListSchema,
  teacherExamStatusLabels,
} from "@/services/exams/schemas";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { prisma } from "@/lib/prisma";
import { listPaperDrafts } from "@/services/exams/paper-drafts";
import { ExamListFilters } from "@/components/exams/exam-list-filters";
import { teacherCourseManagementWhere } from "@/services/courses/repository";

const statusTone = {
  UPCOMING: "bg-sky-50 text-sky-800",
  IN_PROGRESS: "bg-emerald-50 text-emerald-800",
  ENDED: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-rose-50 text-rose-800",
};
const actionClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 motion-safe:transition-colors";

export default async function TeacherExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const query = await searchParams;
  const scope = teacherExamListSchema.safeParse({
    courseId: query.courseId === "" ? undefined : query.courseId,
    classroomId: query.classroomId === "" ? undefined : query.classroomId,
    keyword: query.keyword,
    status: query.status === "" ? undefined : query.status,
    type: query.type === "" ? undefined : query.type,
  });
  if (!scope.success) notFound();
  const now = new Date();
  let exams;
  try {
    exams = await listTeacherExams(teacher.id, scope.data, now);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const [courses, drafts] = await Promise.all([
    prisma.course.findMany({
      where: teacherCourseManagementWhere(teacher.id),
      select: {
        id: true,
        name: true,
        term: true,
        courseNo: true,
        classrooms: {
          where: { teacherId: teacher.id, status: { not: "ARCHIVED" } },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ name: "asc" }, { term: "desc" }, { courseNo: "asc" }],
    }),
    listPaperDrafts(teacher.id, scope.data),
  ]);
  const listQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(scope.data)) {
    if (value) listQuery.set(key, value);
  }
  const classrooms = courses.flatMap((course) =>
    course.classrooms.map((classroom) => ({
      ...classroom,
      courseId: course.id,
    })),
  );
  const archivedCourseSelected = Boolean(
    scope.data.courseId &&
    !courses.some((course) => course.id === scope.data.courseId),
  );
  const archivedClassroomSelected = Boolean(
    scope.data.classroomId &&
    !classrooms.some((classroom) => classroom.id === scope.data.classroomId),
  );
  if (
    (archivedCourseSelected || archivedClassroomSelected) &&
    exams.length === 0 &&
    drafts.length === 0
  ) {
    const hasHistoricalExam =
      (scope.data.keyword || scope.data.status || scope.data.type) &&
      (
        await listTeacherExams(teacher.id, {
          courseId: scope.data.courseId,
          classroomId: scope.data.classroomId,
        })
      ).length > 0;
    if (!hasHistoricalExam) {
      if (archivedCourseSelected) listQuery.delete("courseId");
      listQuery.delete("classroomId");
      redirect(
        listQuery.size ? `/teacher/exams?${listQuery}` : "/teacher/exams",
      );
    }
  }
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-950">考试管理</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            className={`${actionClass} border border-sky-200 bg-white text-sky-800 hover:bg-sky-50 active:bg-sky-100`}
            href="/teacher/exams/import"
          >
            <Upload aria-hidden="true" className="size-4" />
            上传试卷
          </Link>
          <Link
            className={`${actionClass} bg-sky-700 text-white hover:bg-sky-800 active:bg-sky-900`}
            href="/teacher/exams/new"
          >
            <Plus aria-hidden="true" className="size-4" />
            新建考试
          </Link>
        </div>
      </header>
      <ExamListFilters
        key={listQuery.toString()}
        courses={courses.map(({ id, name, term, courseNo }) => ({
          id,
          name,
          term,
          courseNo,
        }))}
        classrooms={classrooms}
        scope={scope.data}
        archivedCourseSelected={archivedCourseSelected}
        archivedClassroomSelected={archivedClassroomSelected}
      />
      {drafts.length > 0 && (
        <section
          id="exam-paper-drafts"
          className="scroll-mt-24 rounded-2xl border border-sky-100 bg-white p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">试卷草稿</h2>
            <Link
              href="/teacher/exams/import"
              className="rounded text-sm font-medium text-sky-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              查看全部草稿
            </Link>
          </div>
          <ul className="grid gap-2 md:grid-cols-3">
            {drafts.slice(0, 3).map((draft) => (
              <li key={draft.id} className="min-w-0 rounded-lg bg-slate-50 p-3">
                <Link
                  className="rounded font-medium [overflow-wrap:anywhere] text-sky-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                  href={`/teacher/exams/drafts/${draft.id}`}
                >
                  {draft.title || draft.sourceFileName}
                </Link>
                <p className="mt-1 text-xs text-slate-600">
                  {draft.status === "READY"
                    ? "待审核发布"
                    : draft.status === "FAILED"
                      ? "解析失败"
                      : "解析中"}{" "}
                  · {draft._count.questions} 题
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="space-y-3" aria-labelledby="exam-results">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="exam-results" className="font-semibold text-slate-950">
            考试场次
          </h2>
          <p className="text-sm text-slate-600 tabular-nums">
            共 {exams.length} 场
          </p>
        </div>
        {exams.length ? (
          <ul className="space-y-3">
            {exams.map((exam) => {
              const state = exam.cancelledAt
                ? "CANCELLED"
                : exam.startsAt > now
                  ? "UPCOMING"
                  : exam.endsAt > now
                    ? "IN_PROGRESS"
                    : "ENDED";
              return (
                <li
                  key={exam.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5"
                >
                  <div className="min-w-0 flex-1 basis-64 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold [overflow-wrap:anywhere] text-slate-950">
                        {exam.title}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        {exam.type === "MIDTERM" ? "期中考试" : "期末考试"}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusTone[state]}`}
                      >
                        {teacherExamStatusLabels[state]}
                      </span>
                    </div>
                    <p className="text-sm [overflow-wrap:anywhere] text-slate-700">
                      {exam.course.name} ·{" "}
                      {exam.assignments
                        .map((item) => item.classroom.name)
                        .join("、") || "暂无教学班"}
                    </p>
                    <p className="flex items-start gap-2 text-sm text-slate-600">
                      <CalendarClock
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <span>
                        {exam.startsAt.toLocaleString("zh-CN")} 至{" "}
                        {exam.endsAt.toLocaleString("zh-CN")}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {state === "UPCOMING" && (
                      <CancelExamButton examId={exam.id} title={exam.title} />
                    )}
                    <Link
                      className={`${actionClass} border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 active:bg-sky-200`}
                      href={`/teacher/exams/${exam.id}${listQuery.size ? `?${listQuery}` : ""}`}
                    >
                      场次详情{" "}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-sky-100 bg-white px-5 py-7">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-800">
              <ClipboardList aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0 flex-1 basis-52">
              <p className="font-semibold text-slate-950">
                {listQuery.size ? "没有符合条件的考试" : "暂无考试场次"}
              </p>
              <p className="mt-1 text-sm [overflow-wrap:anywhere] text-slate-600">
                {listQuery.size
                  ? "可调整筛选条件，或清除筛选查看全部考试。"
                  : "新建考试或上传试卷后，可按教学班查看答卷和成绩。"}
              </p>
            </div>
            {listQuery.size > 0 && (
              <Link
                className={`${actionClass} border border-sky-200 text-sky-800 hover:bg-sky-50`}
                href="/teacher/exams"
              >
                查看全部考试
              </Link>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
