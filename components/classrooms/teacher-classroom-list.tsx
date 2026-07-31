"use client";

import {
  CheckCircle2,
  LoaderCircle,
  MoreVertical,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";

import { requestApi } from "@/components/classrooms/request-api";
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
  const [confirmation, setConfirmation] = useState("");
  const [isDissolving, setIsDissolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeDialog() {
    if (isDissolving) return;
    setDialogOpen(false);
    setConfirmation("");
    setError(null);
  }

  async function confirmDissolution() {
    if (isDissolving || confirmation !== classroom.name) return;
    setIsDissolving(true);
    setError(null);
    const response = await requestApi<ClassroomDissolutionResult>(
      `/api/teacher/classrooms/${classroom.id}`,
      { method: "DELETE" },
    );
    if (!response.success) {
      setError(response.error);
      setIsDissolving(false);
      return;
    }
    setDialogOpen(false);
    setIsDissolving(false);
    onDissolved(response.data);
  }

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
                setError(null);
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
      {dialogOpen ? (
        <div
          aria-labelledby={`dissolve-classroom-${classroom.id}`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
        >
          <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  className="text-lg font-semibold"
                  id={`dissolve-classroom-${classroom.id}`}
                >
                  确认解散班级
                </h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  解散后，学生将退出该班级，但学生账号不会被删除。
                </p>
              </div>
              <button
                aria-label="关闭解散确认框"
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                disabled={isDissolving}
                onClick={closeDialog}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg border bg-gray-50 p-4 text-sm">
              <dt className="text-muted-foreground">班级</dt>
              <dd className="font-medium">{classroom.name}</dd>
              <dt className="text-muted-foreground">学生</dt>
              <dd>{classroom.studentCount} 名</dd>
              <dt className="text-muted-foreground">邀请码</dt>
              <dd className="font-mono">{classroom.joinCode}</dd>
              <dt className="text-muted-foreground">关联课程</dt>
              <dd>{classroom.course?.name ?? "无"}</dd>
            </dl>
            <p className="text-destructive mt-4 text-sm font-medium">
              此操作无法恢复。
            </p>
            <label
              className="mt-4 block text-sm font-medium"
              htmlFor={`classroom-confirm-${classroom.id}`}
            >
              请输入完整班级名称以确认
            </label>
            <input
              autoComplete="off"
              className="border-input mt-2 w-full rounded-md border px-3 py-2 text-sm"
              disabled={isDissolving}
              id={`classroom-confirm-${classroom.id}`}
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
            {error ? (
              <p
                aria-live="polite"
                className="bg-destructive/10 text-destructive mt-4 rounded-md p-3 text-sm"
              >
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
                disabled={isDissolving}
                onClick={closeDialog}
                type="button"
              >
                取消
              </button>
              <button
                className="bg-destructive text-destructive-foreground inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
                disabled={isDissolving || confirmation !== classroom.name}
                onClick={() => void confirmDissolution()}
                type="button"
              >
                {isDissolving ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    解散中...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    确认解散
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
                    setSuccessMessage("班级已解散，学生账号未删除");
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
