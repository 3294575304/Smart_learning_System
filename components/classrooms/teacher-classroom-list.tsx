"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import React from "react";

import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";
import { EmptyState } from "@/components/dashboard/empty-state";
import { School } from "lucide-react";
import type { TeacherClassroomListItem } from "@/services/classrooms/service";

export function TeacherClassroomList({
  initialClassrooms,
}: {
  initialClassrooms: TeacherClassroomListItem[];
}) {
  const classrooms = initialClassrooms;
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">全部班级</h2>
        <span className="text-muted-foreground text-sm">
          共 {classrooms.length} 个
        </span>
      </div>
      {classrooms.length === 0 ? (
        <EmptyState
          description="使用右侧表单创建第一个班级，之后即可邀请学生加入。"
          icon={School}
          title="暂无班级"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {classrooms.map((classroom) => (
            <article
              className="bg-card rounded-xl border p-5 transition-colors hover:bg-sky-50/70"
              key={classroom.id}
            >
              <div className="flex items-start justify-between gap-3">
                <Link
                  className="min-w-0 flex-1"
                  href={`/teacher/classrooms/${classroom.id}`}
                  prefetch={true}
                >
                  <h3 className="truncate font-semibold">{classroom.name}</h3>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {classroom.description ?? "暂无班级说明"}
                  </p>
                </Link>
                <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-800">
                  {CLASSROOM_STATUS_LABELS[classroom.status]}
                </span>
              </div>
              <Link
                className="block"
                href={`/teacher/classrooms/${classroom.id}`}
                prefetch={true}
              >
                <div className="text-muted-foreground mt-5 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {classroom.studentCount} 名学生
                  </span>
                  {classroom.status === "ACTIVE" ? (
                    <span>邀请码 {classroom.joinCode}</span>
                  ) : (
                    <span>历史记录保留</span>
                  )}
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  关联课程：{classroom.course?.name ?? "无"}
                </p>
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
