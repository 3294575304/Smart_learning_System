import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";
import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { TeacherAssignmentNav } from "@/components/assignments/teacher-assignment-nav";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { assignmentIdSchema } from "@/services/assignments/schemas";
import { getTeacherAssignmentOverview } from "@/services/assignments/teacher-overview";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import {
  ASSIGNMENT_FILTER_LABELS,
  assignmentDisplayStatus,
} from "@/services/assignments/presentation";

export default async function TeacherAssignmentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const id = assignmentIdSchema.safeParse((await params).assignmentId);
  if (!id.success) notFound();
  try {
    const { assignment, questions } = await getTeacherAssignmentOverview(
      teacher.id,
      id.data,
    );
    return (
      <section className="space-y-5">
        <TeacherBackLink
          href={
            assignment.classroom.status === "ACTIVE" &&
            assignment.status !== "ARCHIVED" &&
            assignment.status !== "CLOSED"
              ? "/teacher/assignments"
              : "/teacher/assignments?section=HISTORY"
          }
        >
          返回作业管理
        </TeacherBackLink>
        <header className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold break-words">
                {assignment.title}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {assignment.classroom.name} ·{" "}
                {assignment.submissionTask
                  ? "直接任务"
                  : `${questions.length}道题`}{" "}
                · 满分{assignment.totalPoints}分
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-800">
                {assignment.classroom.status === "ACTIVE"
                  ? ASSIGNMENT_FILTER_LABELS[
                      assignmentDisplayStatus(assignment)
                    ]
                  : CLASSROOM_STATUS_LABELS[assignment.classroom.status]}
              </span>
              {assignment.status === "DRAFT" &&
              assignment.classroom.status === "ACTIVE" ? (
                <Link
                  className="rounded-lg border px-3 py-2 text-sm text-sky-800"
                  href={`/teacher/assignments/${assignment.id}/edit`}
                >
                  编辑草稿
                </Link>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t pt-3 text-xs text-slate-500">
            <span>
              发布时间：
              {assignment.publishedAt?.toLocaleString("zh-CN") ?? "未设置"}
            </span>
            <span>
              截止时间：{assignment.dueAt?.toLocaleString("zh-CN") ?? "未设置"}
            </span>
            <span>
              {assignment.allowResubmission
                ? "允许截止前重复提交"
                : "仅允许提交一次"}
            </span>
          </div>
          {assignment.description ? (
            <p className="mt-4 text-sm leading-6 break-words whitespace-pre-wrap text-slate-700">
              {assignment.description}
            </p>
          ) : null}
        </header>
        <TeacherAssignmentNav assignmentId={assignment.id} active="content" />
        <p className="text-xs leading-5 text-slate-500">
          {assignment.status === "DRAFT"
            ? assignment.classroom.status === "ACTIVE"
              ? "以下为当前草稿内容，可通过编辑草稿调整。"
              : "以下为结课前保留的草稿内容，当前只读。"
            : "以下为作业发布时保存的内容，题库后续修改不会改变本次作业。"}
          学生提交记录请进入“提交与批改”。
        </p>
        {assignment.submissionTask ? (
          <section className="space-y-4 rounded-xl border bg-white p-5">
            <h2 className="font-semibold">任务要求</h2>
            <p className="text-sm leading-7 break-words whitespace-pre-wrap">
              {assignment.submissionTask.prompt}
            </p>
            {assignment.resourceFiles?.length ? (
              <div className="rounded-lg bg-slate-50 p-3">
                <h3 className="mb-2 text-sm font-medium">教师任务附件</h3>
                <ul className="space-y-2">
                  {assignment.resourceFiles.map((file) => (
                    <li key={file.id}>
                      <a
                        className="text-sm break-all text-sky-700 hover:underline"
                        href={`/api/assignments/${assignment.id}/resources/${file.id}`}
                      >
                        {file.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                评分参考（仅教师可见）
              </summary>
              <p className="mt-3 text-sm leading-6 break-words whitespace-pre-wrap">
                {assignment.submissionTask.referenceAnswer || "未填写评分参考"}
              </p>
            </details>
          </section>
        ) : questions.length ? (
          <div className="space-y-3">
            {questions.map((question) => (
              <article
                key={question.id}
                className="rounded-xl border bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2
                    className="line-clamp-1 min-w-0 font-semibold break-words"
                    title={question.title}
                  >
                    {question.order}. {question.title}
                  </h2>
                  <span className="shrink-0 text-sm text-sky-800">
                    {question.points}分
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {QUESTION_TYPE_LABELS[question.type]}
                </p>
                <p className="mt-3 text-sm leading-7 break-words whitespace-pre-wrap">
                  {question.content}
                </p>
                {question.options.length ? (
                  <ul className="mt-3 space-y-2">
                    {question.options.map((option) => (
                      <li
                        className="rounded-lg bg-slate-50 px-3 py-2 text-sm break-words"
                        key={option.id}
                      >
                        {option.label}. {option.content}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <details className="mt-4 border-t pt-3">
                  <summary className="cursor-pointer text-sm text-sky-800">
                    参考答案与解析（仅教师可见）
                  </summary>
                  <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm leading-6 break-words whitespace-pre-wrap">
                    <p>参考答案：{question.correctAnswer}</p>
                    <p>解析：{question.explanation || "暂无解析"}</p>
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-white p-6 text-sm text-slate-500">
            当前草稿尚未添加题目，请编辑草稿后发布。
          </div>
        )}
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
