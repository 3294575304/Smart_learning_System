import Link from "next/link";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentExams } from "@/services/exams/service";
import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import { studentTaskHref } from "@/services/student-experience/task-scope";

const button =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
export default async function StudentExamsPage() {
  const student = await requirePageRole(Role.STUDENT);
  const exams = await listStudentExams(student.id);
  const now = new Date();
  return (
    <section className="space-y-5">
      <StudentPageHeader
        title="我的考试"
        description="查看考试安排、考核要求和我的提交状态。正在进行的考试也会显示在学习任务中。"
        actions={
          <Link className={button} href="/student/tasks">
            返回学习任务
          </Link>
        }
      />
      {exams.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {exams.flatMap((exam) =>
            exam.assignments.map((assignment) => {
              const submitted = assignment.submissions.some(
                (s) => s.status !== "IN_PROGRESS",
              );
              const writable =
                assignment.status === "PUBLISHED" &&
                assignment.classroom.status === "ACTIVE";
              const state = submitted
                ? "已提交"
                : !writable
                  ? "只读记录"
                  : now < exam.startsAt
                    ? "待开考"
                    : now >= exam.endsAt
                      ? "已结束"
                      : "考试中";
              const scope = {
                courseId: exam.courseId,
                classroomId: assignment.classroomId,
              };
              const href =
                now < exam.startsAt
                  ? `#exam-${assignment.id}`
                  : studentTaskHref(
                      `/student/assignments/${assignment.id}`,
                      scope,
                    );
              return (
                <article
                  id={`exam-${assignment.id}`}
                  key={assignment.id}
                  className="flex min-w-0 flex-col rounded-2xl border bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold break-words">
                      {exam.title}
                    </h2>
                    <span className="shrink-0 rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-800">
                      {state}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {assignment.classroom.name} ·{" "}
                    {exam.type === "MIDTERM" ? "期中考试" : "期末考试"}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                    <div>
                      <dt className="text-slate-600">开考时间</dt>
                      <dd className="mt-1 font-medium">
                        {exam.startsAt.toLocaleString("zh-CN")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">截止时间</dt>
                      <dd className="mt-1 font-medium">
                        {exam.endsAt.toLocaleString("zh-CN")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">考试时长</dt>
                      <dd className="mt-1 font-medium">
                        {Math.round(
                          (exam.endsAt.getTime() - exam.startsAt.getTime()) /
                            60000,
                        )}{" "}
                        分钟
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-600">允许切屏</dt>
                      <dd className="mt-1 font-medium">
                        {exam.allowedSwitches} 次
                      </dd>
                    </div>
                  </dl>
                  <details className="mt-4 rounded-xl border p-3">
                    <summary className="cursor-pointer rounded font-medium focus-visible:outline-2 focus-visible:outline-sky-700">
                      考核要求与学习安排
                    </summary>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                      <p>
                        请在规定时间内作答并提交，不支持重复提交。切屏要求以考试页面提示为准。
                      </p>
                      <p>
                        当前未提供可公开的考点清单，具体考试范围以教师公布内容为准。
                      </p>
                      <p>
                        备考时，先查看本课程作业中的错题和教师反馈，再复习掌握证据不足的知识点，最后进行限时综合练习。课程复习内容不等于考试范围。
                      </p>
                      <Link
                        className={button}
                        href={studentTaskHref(
                          `/student/courses/${exam.courseId}/learning-center?tab=tasks`,
                          scope,
                        )}
                      >
                        查看课程任务
                      </Link>
                      <Link
                        className={`${button} ml-2`}
                        href={studentTaskHref(
                          "/student/wrong-questions",
                          scope,
                        )}
                      >
                        按课程复习
                      </Link>
                    </div>
                  </details>
                  <div className="mt-4">
                    <Link className={button} href={href}>
                      {submitted || !writable || now >= exam.endsAt
                        ? "查看考试记录"
                        : now < exam.startsAt
                          ? "查看考试安排"
                          : "进入考试"}
                    </Link>
                  </div>
                </article>
              );
            }),
          )}
        </div>
      ) : (
        <div className="rounded-2xl border bg-white p-8 text-slate-600">
          暂无考试安排。已开放的作业、签到和问卷可在学习任务中查看。
        </div>
      )}
    </section>
  );
}
