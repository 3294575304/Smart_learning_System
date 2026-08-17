import { Role } from "@prisma/client";
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentCourseSurveys } from "@/services/course-surveys/service";

export default async function StudentSurveysPage() {
  const student = await requirePageRole(Role.STUDENT);
  const surveys = await listStudentCourseSurveys(student.id);
  return (
    <section className="space-y-6">
      <PageHeader
        description="完成临近结课的课程目标自评和教学质量反馈。所有问卷均不计入课程成绩。"
        title="课程问卷"
      />
      {surveys.length === 0 ? (
        <EmptyState
          description="当前没有待完成的课程问卷。"
          icon={ClipboardCheck}
          title="暂无问卷"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {surveys.map((survey) => (
            <Link
              className="rounded-xl border bg-white p-5 transition-colors hover:bg-gray-50"
              href={`/student/surveys/${survey.id}`}
              key={survey.id}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{survey.title}</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs ${survey.submittedAt ? "bg-gray-100 text-gray-600" : survey.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {survey.submittedAt
                    ? "已提交"
                    : survey.isOpen
                      ? "待完成"
                      : "未开放"}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {survey.course.name} · {survey.classroom.name} ·{" "}
                {survey.mode === "ANONYMOUS" ? "匿名" : "实名"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {survey._count.questions} 题 · 截止{" "}
                {survey.dueAt.toLocaleString("zh-CN")}
              </p>
              <p className="mt-4 text-sm font-medium">
                {survey.submittedAt
                  ? "查看完成状态"
                  : survey.isOpen
                    ? "开始填写"
                    : "查看详情"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
