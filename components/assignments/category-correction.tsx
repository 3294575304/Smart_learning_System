"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EditorDialog } from "./editor-dialog";
import { requestAssignmentApi } from "./request-api";
import {
  ASSIGNMENT_CATEGORY_LABELS,
  assignmentCategorySchema,
  type AssignmentCategoryValue,
} from "@/services/assignments/category";
export function CategoryCorrection({
  id,
  category,
}: {
  id: string;
  category: AssignmentCategoryValue;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(category);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await requestAssignmentApi(
      `/api/teacher/assignments/${id}/category`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: value,
          expectedCategory: category,
          reason,
        }),
      },
    );
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }
  return (
    <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
      <p>
        历史作业已暂归为练习；原台账关联、已公布成绩和报告保留。若与原台账项目不一致，请先核对，不会自动迁移。
      </p>
      <button
        type="button"
        className="mt-2 rounded border border-amber-200 px-3 py-2 font-medium hover:bg-amber-100"
        onClick={() => setOpen(true)}
      >
        确认／修正历史类别
      </button>
      <EditorDialog
        open={open}
        busy={busy}
        title="确认历史作业类别"
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p>本操作仅确认类别，不移动旧台账或重算历史成绩。确认后类别冻结。</p>
          <label className="block">
            作业类别
            <select
              className="mt-1 h-10 w-full rounded-lg border px-3"
              value={value}
              onChange={(e) =>
                setValue(assignmentCategorySchema.parse(e.target.value))
              }
            >
              {Object.entries(ASSIGNMENT_CATEGORY_LABELS).map(
                ([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block">
            核对原因
            <textarea
              required
              minLength={2}
              maxLength={500}
              className="mt-1 w-full rounded-lg border p-3"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {error ? (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              className="h-10 rounded-lg border px-3"
              onClick={() => setOpen(false)}
            >
              取消
            </button>
            <button
              disabled={busy}
              className="h-10 rounded-lg bg-sky-700 px-3 text-white"
            >
              {busy ? "保存中…" : "确认类别"}
            </button>
          </div>
        </form>
      </EditorDialog>
    </div>
  );
}
