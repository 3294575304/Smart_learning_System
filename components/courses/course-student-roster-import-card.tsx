import {
  ArrowRight,
  FileSpreadsheet,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import React from "react";

import type { TeacherCourseClassroomView } from "@/services/courses/types";

export function CourseStudentRosterImportCard({
  courseId,
  linkedClassrooms,
}: {
  courseId: string;
  linkedClassrooms: TeacherCourseClassroomView[];
}) {
  const studentCount = linkedClassrooms.reduce(
    (total, classroom) => total + classroom.studentCount,
    0,
  );

  return (
    <section className="bg-card rounded-xl border p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-gray-600" />
            <h2 className="font-semibold">学生名单管理</h2>
          </div>
          <p className="text-muted-foreground mt-2 text-sm">
            通过分步向导上传名单、核对字段映射、预览错误并建立待认领学生身份。
          </p>
        </div>
        <Link
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          href={`/teacher/courses/${courseId}/students/import`}
        >
          进入名单管理
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="flex items-center gap-2 text-xs text-gray-600">
            <FileSpreadsheet className="h-4 w-4" />
            文件版本
          </p>
          <p className="mt-2 text-sm font-medium">保留每次上传历史</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="flex items-center gap-2 text-xs text-gray-600">
            <UsersRound className="h-4 w-4" />
            当前范围
          </p>
          <p className="mt-2 text-sm font-medium">
            {linkedClassrooms.length} 个班级 · {studentCount} 名学生
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="flex items-center gap-2 text-xs text-gray-600">
            <ShieldCheck className="h-4 w-4" />
            安全注册
          </p>
          <p className="mt-2 text-sm font-medium">学号与名单姓名认领</p>
        </div>
      </div>

      {linkedClassrooms.length === 0 ? (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          当前课程还没有关联班级。请先在右侧关联班级，再进入名单管理。
        </p>
      ) : null}
    </section>
  );
}
