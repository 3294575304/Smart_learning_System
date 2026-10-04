"use client";

import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { useState } from "react";
import { CourseGradeBreakdown } from "@/components/grades/course-grade-breakdown";

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
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? "");
  const classroom = classrooms.find((item) => item.id === classroomId);
  if (!classroom) return null;
  const grade = grades.find((item) => item.classroomId === classroomId);
  const ended = course.status === "ARCHIVED" || classroom.status === "ARCHIVED";
  return (
    <article className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              {course.name}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{course.term}</p>
          </div>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs text-sky-800">
            {ended
              ? "教学已结束"
              : course.status === "DRAFT"
                ? "准备中"
                : "学习中"}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <span className="text-sm text-slate-500">教学班</span>
          {classrooms.length > 1 ? (
            <select
              aria-label={`${course.name}的教学班`}
              value={classroomId}
              onChange={(event) => setClassroomId(event.target.value)}
              className="max-w-full min-w-0 rounded-lg border border-sky-100 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-sky-500"
            >
              {classrooms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-slate-700">{classroom.name}</span>
          )}
        </div>
        <div
          className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-sky-50/60 p-5"
          aria-live="polite"
        >
          <div>
            <p className="text-sm text-slate-500">
              {grade ? "已发布课程成绩" : "课程成绩"}
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-950 tabular-nums">
              {grade
                ? grade.status === "SCORED"
                  ? (grade.score ?? "尚未录入")
                  : (STATUS_LABELS[grade.status] ?? "特殊状态")
                : "待发布"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {grade
                ? `发布于 ${new Date(grade.publishedAt).toLocaleDateString("zh-CN")}`
                : "教师发布后显示，不代表零分。"}
            </p>
          </div>
          {grade?.status === "SCORED" && grade.score !== null && (
            <span className="text-sm text-slate-400">分</span>
          )}
        </div>
        {grade && !ended && (
          <p className="mt-3 text-xs text-slate-500">
            当前成绩可作阶段参考，最终结果以教师结课发布为准。
          </p>
        )}
        {grade && (
          <details
            key={grade.id}
            className="mt-4 border-b border-slate-100 pb-4"
          >
            <summary className="cursor-pointer text-sm font-medium text-sky-700">
              查看成绩构成
            </summary>
            <CourseGradeBreakdown
              components={grade.components}
              snapshot={grade.snapshot}
            />
            <p className="mt-3 text-xs text-slate-400">
              成绩发布版本 {grade.version}
            </p>
          </details>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
        <Link
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          href={`/student/assignments?view=records&courseId=${course.id}&classroomId=${classroom.id}`}
        >
          查看本班作业
        </Link>
        <Link
          className="rounded-lg border border-sky-100 px-4 py-2 text-sm text-slate-700 hover:bg-sky-50"
          href={`/student/courses/${course.id}/profile`}
        >
          课程学习评价
        </Link>
        <Link
          className="ml-auto text-xs text-slate-500 hover:text-sky-700"
          href={`/student/surveys?courseId=${course.id}`}
        >
          课程自评 · 不计入成绩
        </Link>
      </div>
    </article>
  );
}
