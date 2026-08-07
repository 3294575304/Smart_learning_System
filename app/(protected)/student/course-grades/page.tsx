import { Role } from "@prisma/client";

import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentPublishedCourseGradeResults } from "@/services/gradebook/service";

const labels: Record<string, string> = {
  SCORED: "数值成绩",
  NOT_ENTERED: "尚未录入",
  ABSENT: "缺考",
  DEFERRED: "缓考",
  LEAVE: "请假",
  EXEMPT: "免修/不参与",
  CHEATING: "作弊",
  OTHER: "其他",
};

export default async function StudentCourseGradesPage() {
  const student = await requirePageRole(Role.STUDENT);
  const rows = await listStudentPublishedCourseGradeResults(student.id);
  return (
    <section className="space-y-6">
      <PageHeader
        title="课程正式成绩"
        description="这里只显示教师已发布的课程总评；历史发布版本和计算规则由系统保留。"
      />
      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <h2 className="font-semibold">暂无已发布课程成绩</h2>
          <p className="mt-2 text-sm text-gray-500">
            教师发布正式课程总评后会显示在这里。
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => (
            <article
              className="rounded-xl border bg-white p-5"
              key={row.gradebookId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{row.course.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {row.course.term} · {row.classroom.name} · 方案版本{" "}
                    {row.scheme.versionNumber}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">
                    {row.result.effectiveStatus === "SCORED"
                      ? row.result.effectiveScore?.toFixed(2)
                      : labels[row.result.effectiveStatus]}
                  </p>
                  <p className="text-xs text-gray-500">
                    正式版本 {row.publication.versionNumber}
                  </p>
                </div>
              </div>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium">
                  查看计算证据
                </summary>
                <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
                  {JSON.stringify(row.result.componentResultsJson, null, 2)}
                </pre>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
