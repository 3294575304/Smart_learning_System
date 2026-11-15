import Link from "next/link";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentExamRecord } from "@/services/exams/student-record";
import { readActivityPage } from "@/services/student-experience/activity-page";
import { examListReturn } from "@/services/student-experience/activity-query";
import { studentTaskHref } from "@/services/student-experience/task-scope";
import {
  StudentExamDetailHeader,
  examPanelClass,
  examActionClass,
  examTime,
  readStudentExamDetailQuery,
  type StudentExamDetailProps,
} from "@/components/exams/student-exam-detail";

const receipt = {
  MANUAL: "主动交卷",
  TIME_UP: "到时自动收卷",
  SWITCH_LIMIT: "切屏超限自动交卷",
};

export default async function StudentExamRecordPage({
  params,
  searchParams,
}: StudentExamDetailProps) {
  const student = await requirePageRole(Role.STUDENT);
  const [{ examId }, query] = await Promise.all([
    params,
    readStudentExamDetailQuery(searchParams),
  ]);
  const record = await readActivityPage(() =>
    getStudentExamRecord(student.id, examId, query.scope),
  );
  const { exam, submission } = record;
  const scope = { courseId: exam.courseId, classroomId: record.classroomId };
  const back = examListReturn(query.returnTo, { ...scope, focus: record.id });
  const submitted =
    submission && submission.status !== "IN_PROGRESS" ? submission : null;
  const closed = record.dueAt <= new Date();
  return (
    <section className="space-y-5">
      <StudentExamDetailHeader record={record} back={back} title="考试记录" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={examPanelClass}>
          <h2 className="text-lg font-semibold">交卷记录</h2>
          {submitted ? (
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">交卷方式</dt>
                <dd className="mt-1 font-medium">
                  {submitted.examSubmissionReason
                    ? receipt[submitted.examSubmissionReason]
                    : "已提交"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">交卷时间</dt>
                <dd className="mt-1 font-medium">
                  {submitted.submittedAt
                    ? examTime.format(submitted.submittedAt)
                    : "暂无时间记录"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted-foreground mt-3 text-sm">
              {closed ? "考试已截止，未找到交卷记录。" : "当前尚未交卷。"}
              {submission?.lastSavedAt &&
                ` 最近保存于 ${examTime.format(submission.lastSavedAt)}。`}
            </p>
          )}
        </section>
        <section className={examPanelClass}>
          <h2 className="text-lg font-semibold">成绩与答卷</h2>
          <p className="text-muted-foreground mt-3 text-sm">
            {submitted?.status === "PUBLISHED"
              ? "成绩已公布，可查看答卷和教师反馈。"
              : submitted
                ? "已收到答卷，成绩公布后可查看判分与解析。"
                : "暂无可供查看的答卷。"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {submitted && (
              <Link
                className={examActionClass}
                href={studentTaskHref(
                  `/student/submissions/${submitted.id}/result?${new URLSearchParams({ source: "exam", returnTo: back })}`,
                  scope,
                )}
              >
                {submitted.status === "PUBLISHED"
                  ? "查看答卷与反馈"
                  : "查看交卷回执"}
              </Link>
            )}
            {exam.endsAt <= new Date() && (
              <Link
                className={examActionClass}
                href={studentTaskHref(
                  `/student/exams/${exam.id}/report?${new URLSearchParams({ returnTo: back })}`,
                  scope,
                )}
              >
                查看考试报告
              </Link>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
