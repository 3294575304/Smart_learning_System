"use client";

import { LoaderCircle, Trash2, X } from "lucide-react";
import { useState } from "react";

import { requestApi } from "@/components/classrooms/request-api";
import type { ClassroomDissolutionResult } from "@/services/classrooms/service";

export interface DissolvableClassroom {
  id: string;
  name: string;
  studentCount: number;
  courseName: string | null;
}

export function DissolveClassroomDialog({
  classroom,
  open,
  onClose,
  onDissolved,
}: {
  classroom: DissolvableClassroom;
  open: boolean;
  onClose: () => void;
  onDissolved: (result: ClassroomDissolutionResult) => void;
}) {
  const [reason, setReason] = useState("");
  const [isDissolving, setIsDissolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function closeDialog() {
    if (isDissolving) return;
    setReason("");
    setError(null);
    onClose();
  }

  async function confirmDissolution() {
    const normalizedReason = reason.trim();
    if (isDissolving || normalizedReason.length < 2) return;

    setIsDissolving(true);
    setError(null);
    const response = await requestApi<ClassroomDissolutionResult>(
      `/api/teacher/classrooms/${classroom.id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: normalizedReason }),
      },
    );
    if (!response.success) {
      setError(response.error);
      setIsDissolving(false);
      return;
    }

    setReason("");
    setIsDissolving(false);
    onDissolved(response.data);
  }

  return (
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
              解散后学生将退出班级并收到通知；既有作业、成绩和学习记录会保留。
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
          <dt className="text-muted-foreground">关联课程</dt>
          <dd>{classroom.courseName ?? "无"}</dd>
        </dl>

        <label
          className="mt-4 block text-sm font-medium"
          htmlFor={`classroom-dissolution-reason-${classroom.id}`}
        >
          解散原因
        </label>
        <textarea
          autoFocus
          className="border-input mt-2 min-h-24 w-full resize-y rounded-md border px-3 py-2 text-sm"
          disabled={isDissolving}
          id={`classroom-dissolution-reason-${classroom.id}`}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="请填写解散原因（2—500 个字符），该原因会通知班内学生"
          value={reason}
        />
        <div className="text-muted-foreground mt-1 text-right text-xs">
          {reason.length}/500
        </div>

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
            disabled={isDissolving || reason.trim().length < 2}
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
  );
}
