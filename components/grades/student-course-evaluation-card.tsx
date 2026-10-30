"use client";

import type { Prisma } from "@prisma/client";
import React, { useState } from "react";
import { EditorDialog } from "@/components/assignments/editor-dialog";
import { CourseGradeBreakdown } from "@/components/grades/course-grade-breakdown";
import { studentEnrollmentStatus } from "@/services/courses/student-enrollment";

interface Props {
  course: { id: string; name: string; term: string; status: string };
  classrooms: { id: string; name: string; status: string }[];
  grades: {
    id: string;
    classroomId: string;
    score: string | null;
    status: string;
    publishedAt: string;
    version: number;
    components: Prisma.JsonValue;
    snapshot: Prisma.JsonValue;
  }[];
}
const STATUS_LABELS: Record<string, string> = {
  NOT_ENTERED: "尚未录入",
  ABSENT: "缺考",
  DEFERRED: "缓考",
  LEAVE: "请假",
  EXEMPT: "免修",
  CHEATING: "作弊",
  OTHER: "特殊状态",
};
export function StudentCourseEvaluationCard({
  course,
  classrooms,
  grades,
}: Props) {
  const [open, setOpen] = useState(false);
  const classroom = classrooms[0];
  if (!classroom) return null;
  const grade = grades.find((item) => item.classroomId === classroom.id);
  const { label, readOnly } = studentEnrollmentStatus(
    course.status,
    classroom.status,
  );
  const numeric = grade?.status === "SCORED" && grade.score !== null;
  const score = grade
    ? grade.status === "SCORED"
      ? (grade.score ?? "尚未录入")
      : (STATUS_LABELS[grade.status] ?? "特殊状态")
    : "待发布";
  const button =
    "inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-sky-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold [overflow-wrap:anywhere] text-slate-950">
            {course.name}
          </h2>
          <p className="mt-1 text-sm [overflow-wrap:anywhere] text-sky-700">
            {classroom.name}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-xs ${grade ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
        >
          {grade ? "已发布" : "待发布"}
        </span>
      </div>
      <p className="mt-2 text-xs [overflow-wrap:anywhere] text-slate-500">
        {course.term} · {label}
      </p>
      <div className="my-4 flex items-end justify-between gap-3 border-y border-slate-100 py-4">
        <div>
          <p className="text-xs text-slate-500">课程总评</p>
          <p
            className={`${numeric ? "text-3xl" : "text-xl"} mt-1 font-semibold text-slate-950 tabular-nums`}
          >
            {score}
            {numeric && (
              <span className="ml-1 text-sm font-normal text-slate-400">
                分
              </span>
            )}
          </p>
        </div>
        <p className="text-right text-xs leading-5 text-slate-500">
          {grade ? (
            <>
              {new Date(grade.publishedAt).toLocaleDateString("zh-CN")} 发布
              <br />
              版本 {grade.version}
            </>
          ) : (
            "教师发布后可查看"
          )}
        </p>
      </div>
      {grade && (
        <>
          <p className="mb-4 text-xs leading-5 text-slate-600">
            {readOnly
              ? "可查看教师已发布的各项成绩。"
              : "当前总评供参考，以教师最终发布为准。"}
          </p>
          <button
            type="button"
            className={`${button} mt-auto w-full bg-sky-700 text-white hover:bg-sky-800`}
            onClick={() => setOpen(true)}
          >
            成绩构成
          </button>
          <EditorDialog
            open={open}
            title={`${course.name} · 成绩构成`}
            onClose={() => setOpen(false)}
          >
            <p className="mt-2 text-sm [overflow-wrap:anywhere] text-slate-500">
              {classroom.name} · {score}
              {numeric ? " 分" : ""}
            </p>
            <CourseGradeBreakdown
              components={grade.components}
              snapshot={grade.snapshot}
            />
            <p className="mt-4 text-xs text-slate-400">
              发布版本 {grade.version} ·{" "}
              {new Date(grade.publishedAt).toLocaleDateString("zh-CN")}
            </p>
            <button
              type="button"
              className={`${button} mt-5 w-full bg-sky-50 text-sky-900 hover:bg-sky-100`}
              onClick={() => setOpen(false)}
            >
              关闭
            </button>
          </EditorDialog>
        </>
      )}
    </article>
  );
}
