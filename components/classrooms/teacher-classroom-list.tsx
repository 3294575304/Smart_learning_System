"use client";

import { CheckCircle2, MoreVertical, Trash2, Users } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";

import { DissolveClassroomDialog } from "@/components/classrooms/dissolve-classroom-dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { School } from "lucide-react";
import type {
  ClassroomDissolutionResult,
  TeacherClassroomListItem,
} from "@/services/classrooms/service";

function DissolveAction({
  classroom,
  onDissolved,
}: {
  classroom: TeacherClassroomListItem;
  onDissolved: (result: ClassroomDissolutionResult) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div className="relative shrink-0">
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={`打开“${classroom.name}”班级操作菜单`}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          type="button"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div
            aria-label="班级操作"
            className="absolute top-10 right-0 z-20 min-w-36 rounded-md border bg-white p-1 shadow-lg"
            role="menu"
          >
            <button
              className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenuOpen(false);
                setDialogOpen(true);
              }}
              role="menuitem"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
              解散班级
            </button>
          </div>
        ) : null}
      </div>
      <DissolveClassroomDialog
        classroom={{
          id: classroom.id,
          name: classroom.name,
          studentCount: classroom.studentCount,
          courseName: classroom.course?.name ?? null,
        }}
        onClose={() => setDialogOpen(false)}
        onDissolved={(result) => {
          setDialogOpen(false);
          onDissolved(result);
        }}
        open={dialogOpen}
      />
    </>
  );
}

export function TeacherClassroomList({
  initialClassrooms,
}: {
  initialClassrooms: TeacherClassroomListItem[];
}) {
  const [classrooms, setClassrooms] = useState(initialClassrooms);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">全部班级</h2>
        <span className="text-muted-foreground text-sm">
          共 {classrooms.length} 个
        </span>
      </div>
      {successMessage ? (
        <div
          aria-live="polite"
          className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
      ) : null}
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
              className="bg-card rounded-xl border p-5 transition-colors hover:bg-gray-50"
              key={classroom.id}
            >
              <div className="flex items-start justify-between gap-3">
                <Link
                  className="min-w-0 flex-1"
                  href={`/teacher/classrooms/${classroom.id}`}
                >
                  <h3 className="truncate font-semibold">{classroom.name}</h3>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {classroom.description ?? "暂无班级说明"}
                  </p>
                </Link>
                <DissolveAction
                  classroom={classroom}
                  onDissolved={(result) => {
                    setClassrooms((items) =>
                      items.filter((item) => item.id !== result.id),
                    );
                    setSuccessMessage(
                      `班级已解散，已通知 ${result.notifiedStudentCount} 名学生，历史教学数据已保留`,
                    );
                  }}
                />
              </div>
              <Link
                className="block"
                href={`/teacher/classrooms/${classroom.id}`}
              >
                <div className="text-muted-foreground mt-5 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {classroom.studentCount} 名学生
                  </span>
                  <span>邀请码 {classroom.joinCode}</span>
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
