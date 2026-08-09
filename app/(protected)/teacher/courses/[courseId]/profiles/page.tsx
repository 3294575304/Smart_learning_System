import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { studentProfilePathSchema } from "@/services/learner-profiles/schemas";
import { listTeacherCourseLearnerProfiles } from "@/services/learner-profiles/service";

const stateLabels: Record<string, string> = {
  NO_EVIDENCE: "无证据",
  INSUFFICIENT_EVIDENCE: "证据不足",
  CONCLUSIVE: "可形成结论",
};

type Props = { params: Promise<{ courseId: string }> };

export default async function TeacherCourseProfilesPage({ params }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const path = studentProfilePathSchema.safeParse(await params);
  if (!path.success) notFound();
  try {
    const result = await listTeacherCourseLearnerProfiles(
      teacher.id,
      path.data.courseId,
    );
    return (
      <section className="space-y-6">
        <header>
          <Link
            className="text-muted-foreground text-sm underline"
            href={`/teacher/courses/${path.data.courseId}`}
          >
            返回课程
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">
            {result.course.name} · 班级画像概览
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            摘要由确定性规则生成；证据不足的学生不会输出过度确定结论。
          </p>
        </header>
        {result.items.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center">
            当前课程没有在读学生。
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {result.items.map((item) => (
              <article
                className="rounded-xl border bg-white p-5"
                key={item.student.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      {item.student.displayName}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {item.student.studentNo ?? "无学号"}
                    </p>
                  </div>
                  <span className="rounded-full border px-2.5 py-1 text-xs">
                    {stateLabels[item.evidenceState] ?? item.evidenceState}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6">{item.summary}</p>
                <p className="text-muted-foreground mt-3 text-xs">
                  稳定概念 {item.conclusiveConceptCount} 个 · 平均掌握度{" "}
                  {item.conclusiveAverageMastery ?? "—"}% · 快照 #
                  {item.revisionNumber}
                </p>
                <Link
                  className="mt-4 inline-flex rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white"
                  href={`/teacher/courses/${path.data.courseId}/students/${item.student.id}/profile`}
                >
                  查看证据详情
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
