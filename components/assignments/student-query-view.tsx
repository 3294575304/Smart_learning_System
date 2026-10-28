import { notFound } from "next/navigation";
import { listTeacherCourses } from "@/services/courses/service";
import { listTeacherStudentAssignments } from "@/services/assignments/student-service";
import {
  studentListHref,
  type TeacherStudentQuery,
} from "@/services/assignments/student-query";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageIndex } from "@/components/dashboard/page-index";
import {
  AssignmentCourseFilter,
  StudentAssignmentFilters,
} from "./student-filters";
import { AssignmentManagementTabs } from "./management-tabs";

export async function TeacherStudentAssignmentsView({
  teacherId,
  query,
  notice,
}: {
  teacherId: string;
  query: TeacherStudentQuery;
  notice: boolean;
}) {
  const [result, courses] = await Promise.all([
    listTeacherStudentAssignments(teacherId, query).catch((error: unknown) => {
      if (error instanceof ResourceNotFoundError) notFound();
      throw error;
    }),
    listTeacherCourses(teacherId),
  ]);
  const detailHref = (
    studentId: string,
    classroomId: string,
    submissionFilter = query.submissionFilter,
  ) => {
    const params = new URLSearchParams({
      classroomId,
      section: query.section,
      submissionFilter,
      returnTo: studentListHref(query),
    });
    if (query.courseId) params.set("courseId", query.courseId);
    return `/teacher/assignments/students/${studentId}?${params}`;
  };
  return (
    <section className="min-w-0 space-y-4">
      <PageHeader title="作业管理" description="按姓名或学号查询学生作业。" />
      <AssignmentCourseFilter
        key={`course:${JSON.stringify(query)}`}
        courses={courses}
        classrooms={result.classrooms}
        courseId={query.courseId}
        classroomId={query.classroomId}
        section="ALL"
        notice={notice}
        studentQuery={query}
      />
      <AssignmentManagementTabs
        view="STUDENTS"
        section={query.section}
        courseId={query.courseId}
        classroomId={query.classroomId}
      />
      <StudentAssignmentFilters
        key={JSON.stringify(query)}
        query={query}
        classrooms={result.classrooms}
      />
      <p className="text-sm text-slate-500">
        共 {result.pagination.total} 条记录 · 包含当前及历史已开放作业
      </p>
      {result.items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center text-slate-500">
          当前条件下没有学生记录，请调整课程、班级或搜索条件。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                {[
                  "学号",
                  "姓名",
                  "教学班",
                  "已交 / 应交",
                  "逾期未交",
                  "待批改",
                  "操作",
                ].map((label) => (
                  <th key={label} className="px-4 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr
                  key={`${item.classroomId}:${item.studentId}`}
                  className="border-b last:border-0"
                >
                  <td className="px-4 py-4 tabular-nums">
                    {item.studentNo ?? "—"}
                  </td>
                  <td className="px-4 py-4">
                    <a
                      className="font-medium text-sky-700"
                      href={detailHref(item.studentId, item.classroomId)}
                    >
                      {item.name}
                    </a>
                    {!item.active && (
                      <span className="ml-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">
                        历史成员
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">{item.classroomName}</td>
                  <td className="px-4 py-4">
                    {item.active && item.expected
                      ? `${item.submitted} / ${item.expected}`
                      : "—"}
                    {!item.active && (
                      <span className="block text-xs text-slate-500">
                        已交 {item.submitted} 份
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {item.active ? (
                      <a
                        className="text-sky-700"
                        href={detailHref(
                          item.studentId,
                          item.classroomId,
                          "OVERDUE",
                        )}
                      >
                        {item.overdue} 份
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {item.active ? (
                      <a
                        className="text-sky-700"
                        href={detailHref(
                          item.studentId,
                          item.classroomId,
                          "PENDING_REVIEW",
                        )}
                      >
                        {item.pending} 份
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <a
                      className="inline-flex h-10 items-center rounded-lg border px-3 text-sky-700"
                      href={detailHref(item.studentId, item.classroomId)}
                    >
                      查看作业
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PageIndex
        nativeNavigation
        ariaLabel="学生作业分页"
        page={query.page}
        totalPages={result.pagination.totalPages}
        hrefForPage={(page) => studentListHref(query, page)}
      />
    </section>
  );
}
