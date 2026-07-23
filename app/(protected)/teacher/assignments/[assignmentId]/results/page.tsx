import { Role, SubmissionStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResultsPagination } from "@/components/assignment-results/pagination";
import { PublishResultsButton } from "@/components/assignment-results/publish-results-button";
import { ScoreDistribution } from "@/components/assignment-results/score-distribution";
import { StudentAnswerDetail } from "@/components/assignment-results/student-answer-detail";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { requirePageRole } from "@/services/auth/page-authorization";
import { assignmentResultsQuerySchema } from "@/services/assignment-results/schemas";
import {
  assignmentResultStatusLabels,
  getTeacherAssignmentResults,
} from "@/services/assignment-results/service";
import { assignmentIdSchema } from "@/services/assignments/schemas";

interface ResultsPageProps {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function singleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function scoreText(value: number | null, totalPoints: number): string {
  return value === null ? "—" : `${value.toFixed(2)} / ${totalPoints}`;
}

function accuracyText(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function studentDetailHref(
  assignmentId: string,
  studentId: string,
  submissionId: string | null,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    studentId,
  });
  if (submissionId) params.set("submissionId", submissionId);
  return `/teacher/assignments/${assignmentId}/results?${params.toString()}#student-detail`;
}

export default async function AssignmentResultsPage({
  params,
  searchParams,
}: ResultsPageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const rawParams = await params;
  const parsedId = assignmentIdSchema.safeParse(rawParams.assignmentId);
  const rawQuery = await searchParams;
  const parsedQuery = assignmentResultsQuerySchema.safeParse({
    page: singleValue(rawQuery.page),
    pageSize: singleValue(rawQuery.pageSize),
    studentId: singleValue(rawQuery.studentId),
    submissionId: singleValue(rawQuery.submissionId),
  });
  if (!parsedId.success || !parsedQuery.success) notFound();

  try {
    const results = await getTeacherAssignmentResults(
      teacher.id,
      parsedId.data,
      parsedQuery.data,
    );
    if (
      results.students.totalPages > 0 &&
      results.students.page > results.students.totalPages
    ) {
      notFound();
    }

    return (
      <section className="space-y-6">
        <header>
          <Link
            className="text-muted-foreground text-sm underline"
            href="/teacher/assignments"
          >
            返回作业管理
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">
                {results.assignment.title}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                {results.assignment.classroom.name} · 满分{" "}
                {results.assignment.totalPoints} 分
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <PublishResultsButton assignmentId={results.assignment.id} />
              <Link
                className="text-sm underline"
                href={`/teacher/assignments/${results.assignment.id}/submissions`}
              >
                进入提交批改
              </Link>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">
                基于每名学生最新有效提交
              </span>
            </div>
          </div>
        </header>

        {results.summary.studentCount === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed bg-white p-10 text-center">
            当前班级暂无在班学生，暂时无法生成成绩统计。
          </div>
        ) : results.summary.submittedCount === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed bg-white p-8 text-center">
            暂无学生提交作业。页面仍会展示班级名单和未提交状态。
          </div>
        ) : null}

        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="bg-card rounded-xl border p-5">
            <dt className="text-muted-foreground text-sm">班级平均分</dt>
            <dd className="mt-2 text-2xl font-semibold">
              {scoreText(
                results.summary.averageScore,
                results.assignment.totalPoints,
              )}
            </dd>
            <p className="text-muted-foreground mt-2 text-xs">
              已完成批改 {results.summary.finalizedCount} 人
            </p>
          </div>
          <div className="bg-card rounded-xl border p-5">
            <dt className="text-muted-foreground text-sm">最高分</dt>
            <dd className="mt-2 text-2xl font-semibold">
              {scoreText(
                results.summary.highestScore,
                results.assignment.totalPoints,
              )}
            </dd>
          </div>
          <div className="bg-card rounded-xl border p-5">
            <dt className="text-muted-foreground text-sm">最低分</dt>
            <dd className="mt-2 text-2xl font-semibold">
              {scoreText(
                results.summary.lowestScore,
                results.assignment.totalPoints,
              )}
            </dd>
          </div>
          <div className="bg-card rounded-xl border p-5">
            <dt className="text-muted-foreground text-sm">提交人数</dt>
            <dd className="mt-2 text-2xl font-semibold">
              {results.summary.submittedCount}
            </dd>
            <p className="text-muted-foreground mt-2 text-xs">
              班级共 {results.summary.studentCount} 人
            </p>
          </div>
          <div className="bg-card rounded-xl border p-5">
            <dt className="text-muted-foreground text-sm">未提交人数</dt>
            <dd className="mt-2 text-2xl font-semibold">
              {results.summary.unsubmittedCount}
            </dd>
            <p className="text-muted-foreground mt-2 text-xs">
              作答中仍按未提交计
            </p>
          </div>
        </dl>

        <div className="grid gap-6 lg:grid-cols-2">
          <ScoreDistribution buckets={results.distribution} />
          <section className="bg-card rounded-xl border p-5">
            <h2 className="font-semibold">高频错题</h2>
            {results.frequentWrongQuestions.length === 0 ? (
              <div className="text-muted-foreground mt-4 rounded-lg border border-dashed p-8 text-center text-sm">
                暂无已判定的错误答案。
              </div>
            ) : (
              <ol className="mt-4 space-y-3">
                {results.frequentWrongQuestions.map((question) => (
                  <li
                    className="rounded-lg border p-3"
                    key={question.assignmentQuestionId}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">
                        {question.sortOrder}. {question.title}
                      </p>
                      <span className="shrink-0 text-sm font-semibold text-red-700">
                        错 {question.wrongCount} 人
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      错误率{" "}
                      {accuracyText(
                        question.accuracy === null
                          ? null
                          : 100 - question.accuracy,
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className="bg-card rounded-xl border p-5">
          <h2 className="font-semibold">每道题正确率</h2>
          {results.questionAccuracy.length === 0 ? (
            <div className="text-muted-foreground mt-4 rounded-lg border border-dashed p-8 text-center text-sm">
              该作业暂无题目。
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="py-3 pr-4 font-medium">题目</th>
                    <th className="py-3 pr-4 font-medium">分值</th>
                    <th className="py-3 pr-4 font-medium">已判定</th>
                    <th className="py-3 pr-4 font-medium">正确人数</th>
                    <th className="py-3 font-medium">正确率</th>
                  </tr>
                </thead>
                <tbody>
                  {results.questionAccuracy.map((question) => (
                    <tr
                      className="border-b last:border-0"
                      key={question.assignmentQuestionId}
                    >
                      <td className="py-3 pr-4 font-medium">
                        {question.sortOrder}. {question.title}
                      </td>
                      <td className="py-3 pr-4">{question.points}</td>
                      <td className="py-3 pr-4">{question.judgedCount}</td>
                      <td className="py-3 pr-4">{question.correctCount}</td>
                      <td className="py-3">
                        {accuracyText(question.accuracy)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-card rounded-xl border p-5">
          <h2 className="font-semibold">每个知识点正确率</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            按作业发布时保存的题目—知识点权重计算。
          </p>
          {results.knowledgePointAccuracy.length === 0 ? (
            <div className="text-muted-foreground mt-4 rounded-lg border border-dashed p-8 text-center text-sm">
              作业题目尚未关联知识点。
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="py-3 pr-4 font-medium">知识点</th>
                    <th className="py-3 pr-4 font-medium">编码</th>
                    <th className="py-3 pr-4 font-medium">已判定权重</th>
                    <th className="py-3 font-medium">正确率</th>
                  </tr>
                </thead>
                <tbody>
                  {results.knowledgePointAccuracy.map((knowledge) => (
                    <tr
                      className="border-b last:border-0"
                      key={knowledge.knowledgePointId}
                    >
                      <td className="py-3 pr-4 font-medium">
                        {knowledge.name}
                      </td>
                      <td className="py-3 pr-4">{knowledge.code}</td>
                      <td className="py-3 pr-4">{knowledge.judgedWeight}</td>
                      <td className="py-3">
                        {accuracyText(knowledge.accuracy)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-card rounded-xl border p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-semibold">学生成绩列表</h2>
            <p className="text-muted-foreground text-xs">
              待人工批改提交不进入平均分和成绩分布
            </p>
          </div>
          {results.students.items.length === 0 ? (
            <div className="text-muted-foreground mt-4 rounded-lg border border-dashed p-8 text-center text-sm">
              暂无学生成绩数据。
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="py-3 pr-4 font-medium">学生</th>
                    <th className="py-3 pr-4 font-medium">学号</th>
                    <th className="py-3 pr-4 font-medium">提交状态</th>
                    <th className="py-3 pr-4 font-medium">成绩</th>
                    <th className="py-3 pr-4 font-medium">提交时间</th>
                    <th className="py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {results.students.items.map((student) => {
                    const finalized =
                      student.status === SubmissionStatus.GRADED ||
                      student.status === SubmissionStatus.PUBLISHED;
                    return (
                      <tr
                        className="border-b last:border-0"
                        key={student.studentId}
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium">{student.displayName}</p>
                          <p className="text-muted-foreground">
                            {student.email}
                          </p>
                        </td>
                        <td className="py-3 pr-4">
                          {student.studentNo ?? "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {student.status
                            ? assignmentResultStatusLabels[student.status]
                            : "未提交"}
                          {student.attemptNumber
                            ? ` · 第 ${student.attemptNumber} 次`
                            : ""}
                        </td>
                        <td className="py-3 pr-4 font-medium">
                          {finalized &&
                          student.score !== null &&
                          student.maxScore !== null
                            ? `${student.score} / ${student.maxScore}（${student.percentage}%）`
                            : student.status
                              ? "待批改"
                              : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {student.submittedAt?.toLocaleString("zh-CN") ?? "—"}
                        </td>
                        <td className="py-3">
                          <Link
                            className="underline"
                            href={studentDetailHref(
                              results.assignment.id,
                              student.studentId,
                              student.submissionId,
                              results.students.page,
                              results.students.pageSize,
                            )}
                          >
                            查看作答
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <ResultsPagination
            assignmentId={results.assignment.id}
            page={results.students.page}
            pageSize={results.students.pageSize}
            total={results.students.total}
            totalPages={results.students.totalPages}
          />
        </section>

        {results.selectedStudent ? (
          <StudentAnswerDetail
            assignmentId={results.assignment.id}
            detail={results.selectedStudent}
            page={results.students.page}
            pageSize={results.students.pageSize}
          />
        ) : null}
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
