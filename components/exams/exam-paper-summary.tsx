import {
  examClassroomHref,
  examWorkspaceHref,
} from "@/services/exams/classroom-navigation";
import type { getTeacherExamHeader } from "@/services/exams/analysis";
import { examTypeLabel } from "@/services/exams/exam-types";

type ExamHeader = Awaited<ReturnType<typeof getTeacherExamHeader>>;

/**
 * 试卷页顶部的考试信息摘要。
 *
 * 与考试工作台的 `ExamWorkspaceSummary` 分开：这里只展示本场次规则与所属班级，
 * 不加载参考率与题目分析，避免教师查看试卷时触发昂贵的统计查询。
 */
export function ExamPaperSummary({
  exam,
  assignmentId,
  listContext,
}: {
  exam: ExamHeader;
  assignmentId: string;
  listContext?: string;
}) {
  return (
    <section className="bg-card border-line rounded-xl border p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">
        {exam.title} · {examTypeLabel(exam.type)}
        {exam.cancelledAt ? " · 已取消" : ""}
      </h2>
      <p className="text-ink-soft mt-1 text-sm leading-6">
        {exam.startsAt.toLocaleString("zh-CN")} 至{" "}
        {exam.endsAt.toLocaleString("zh-CN")} · 允许切屏 {exam.allowedSwitches}{" "}
        次 · 允许考试 {exam.allowedAttempts} 次 ·
        {exam.autoSubmitOnExit ? "退出自动交卷" : "退出可继续作答"}
      </p>
      {exam.assignments.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="考试教学班">
          {exam.assignments.map((assignment) => (
            <a
              key={assignment.id}
              href={examWorkspaceHref(
                examClassroomHref(exam.id, assignment.id),
                listContext,
              )}
              aria-current={assignment.id === assignmentId ? "page" : undefined}
              className={`inline-flex min-h-10 min-w-0 items-center rounded-lg border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 motion-safe:transition-colors ${
                assignment.id === assignmentId
                  ? "border-sky-700 bg-sky-50 text-sky-800"
                  : "border-sky-200 text-sky-800 hover:bg-sky-50 active:bg-sky-100"
              }`}
            >
              <span className="[overflow-wrap:anywhere]">
                {assignment.classroom.name}
              </span>
            </a>
          ))}
        </nav>
      )}
    </section>
  );
}
