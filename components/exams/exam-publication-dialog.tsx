"use client";

import { EditorDialog } from "@/components/assignments/editor-dialog";
import type { ExamCreateInput } from "@/services/exams/schemas";

export function ExamPublicationDialog({
  exam,
  course,
  classrooms,
  fromPaper = false,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  exam: ExamCreateInput | null;
  course: string;
  classrooms: string[];
  fromPaper?: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <EditorDialog
      open={Boolean(exam)}
      title="核对考试并发布"
      busy={busy}
      onClose={onClose}
    >
      {exam && (
        <>
          <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-slate-600">考试</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">
                {exam.title} ·{" "}
                {exam.type === "MIDTERM" ? "期中考试" : "期末考试"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-slate-600">课程</dt>
              <dd className="[overflow-wrap:anywhere]">{course}</dd>
            </div>
            <div>
              <dt className="text-slate-600">试卷</dt>
              <dd>
                {exam.questions.length} 题 ·{" "}
                {Math.round(
                  exam.questions.reduce((sum, row) => sum + row.points, 0) *
                    100,
                ) / 100}{" "}
                分
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">开考</dt>
              <dd>{exam.startsAt.toLocaleString("zh-CN")}</dd>
            </div>
            <div>
              <dt className="text-slate-600">截止</dt>
              <dd>{exam.endsAt.toLocaleString("zh-CN")}</dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-slate-600">
                参加班级（{classrooms.length} 个）
              </dt>
              <dd className="[overflow-wrap:anywhere]">
                {classrooms.join("、")}
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">允许切屏</dt>
              <dd>{exam.allowedSwitches} 次</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-slate-700">
            发布后会冻结试卷和考试规则，各班独立保存答卷和成绩。
            {fromPaper &&
              "本次发布使用已保存且已审核的题目，新题将进入共享题库。"}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-800">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="min-h-10 rounded-lg border px-4 text-sm disabled:opacity-50"
            >
              返回修改
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="min-h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {busy ? "正在发布…" : "确认发布考试"}
            </button>
          </div>
        </>
      )}
    </EditorDialog>
  );
}
