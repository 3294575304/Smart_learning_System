"use client";

import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";

export default function ExamError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4">
      <TeacherBackLink href="/teacher/exams">返回考试管理</TeacherBackLink>
      <div className="rounded-xl border bg-white p-5">
        <h1 className="text-lg font-semibold">暂时无法加载考试详情</h1>
        <p className="mt-2 text-sm text-slate-600">
          可以重试此页，或返回考试管理重新打开场次。
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 min-h-10 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        >
          重试
        </button>
      </div>
    </section>
  );
}
