import { Role, SubmissionStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StartAttemptButton } from "@/components/assignments/start-attempt-button";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentAssignment } from "@/services/assignments/service";

interface Props {
  params: Promise<{ assignmentId: string }>;
}
export default async function StudentAssignmentPage({ params }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  try {
    const assignment = await getStudentAssignment(
      student.id,
      (await params).assignmentId,
    );
    const inProgress = assignment.attempts.find(
      (item) => item.status === SubmissionStatus.IN_PROGRESS,
    );
    const submitted = assignment.attempts.filter(
      (item) => item.status !== SubmissionStatus.IN_PROGRESS,
    );
    const canStart =
      !assignment.isExpired &&
      (assignment.allowResubmission || submitted.length === 0);
    return (
      <section className="space-y-6">
        <div>
          <Link
            className="text-sm text-gray-500 hover:underline"
            href="/student/assignments"
          >
            ← 返回作业列表
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{assignment.title}</h1>
          <p className="mt-2 text-gray-600">
            {assignment.description || "暂无作业说明"}
          </p>
          <p className="mt-2 text-sm text-gray-500">
            {assignment.classroomName} · {assignment.questions.length} 题 ·{" "}
            {assignment.totalPoints} 分
          </p>
          <p className="mt-1 text-sm text-gray-500">
            截止：{assignment.dueAt?.toLocaleString("zh-CN") ?? "未设置"}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {inProgress ? (
            <Link
              className="rounded-md bg-black px-4 py-2 text-white"
              href={`/student/submissions/${inProgress.id}/answer`}
            >
              继续作答
            </Link>
          ) : canStart ? (
            <StartAttemptButton assignmentId={assignment.id} />
          ) : null}
          {assignment.isExpired ? (
            <p className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-600">
              作业已截止，不能再提交。
            </p>
          ) : null}
        </div>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">题目概览</h2>
          <ol className="mt-3 space-y-2">
            {assignment.questions.map((question) => (
              <li
                className="flex justify-between gap-4 text-sm"
                key={question.id}
              >
                <span>
                  {question.sortOrder}. {question.title}
                </span>
                <span className="text-gray-500">{question.points} 分</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">提交记录</h2>
          {submitted.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">暂无提交记录。</p>
          ) : (
            <div className="mt-3 space-y-2">
              {submitted.map((attempt) => (
                <Link
                  className="flex justify-between rounded-md border p-3 text-sm hover:bg-gray-50"
                  href={`/student/submissions/${attempt.id}/result`}
                  key={attempt.id}
                >
                  <span>第 {attempt.attemptNumber} 次提交</span>
                  <span>查看结果</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
