"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Revision = {
  revisionNumber: number;
  status: string;
  score: string | null;
};
type Item = {
  id: string;
  name: string;
  maxScore: string;
  sourceType: string;
  componentId: string;
  entries: Array<{ studentId: string; revisions: Revision[] }>;
};
type Student = {
  id: string;
  studentNo: string | null;
  displayName: string;
  latestGrade: {
    effectiveStatus: string;
    effectiveScore: string | null;
  } | null;
};
type Workspace = {
  gradebook: {
    id: string;
    course: { name: string };
    classroom: { name: string };
    scheme: {
      components: Array<{ id: string; name: string; sourceType: string }>;
    };
  };
  items: Item[];
  students: Student[];
  assignments: Array<{ id: string; title: string; status: string }>;
  currentPublication: { versionNumber: number; publishedAt: string } | null;
};

const statusOptions = [
  ["SCORED", "数值成绩"],
  ["NOT_ENTERED", "尚未录入"],
  ["ABSENT", "缺考"],
  ["DEFERRED", "缓考"],
  ["LEAVE", "请假"],
  ["EXEMPT", "免修/不参与"],
  ["CHEATING", "作弊"],
  ["OTHER", "其他"],
] as const;

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  if (!response.ok || !payload.success)
    throw new Error(payload.error ?? "请求失败。");
  return payload.data;
}

export function GradebookWorkspace({ gradebookId }: { gradebookId: string }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [componentId, setComponentId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    validRows: number;
    invalidRows: number;
    rows: Array<{
      rowNumber: number;
      studentNo: string;
      previewStatus: string;
      errorDetail?: { message?: string };
    }>;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        (await requestJson(
          `/api/teacher/gradebooks/${gradebookId}`,
        )) as Workspace,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败。");
    }
  }, [gradebookId]);
  useEffect(() => {
    void load();
  }, [load]);

  const platformComponents = useMemo(
    () =>
      data?.gradebook.scheme.components.filter(
        (item) => item.sourceType === "PLATFORM_ASSIGNMENT",
      ) ?? [],
    [data],
  );
  async function action(url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await requestJson(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }
  async function edit(item: Item, student: Student) {
    const current = item.entries.find((entry) => entry.studentId === student.id)
      ?.revisions[0];
    const status = window.prompt(
      "状态：SCORED/NOT_ENTERED/ABSENT/DEFERRED/LEAVE/EXEMPT/CHEATING/OTHER",
      current?.status ?? "SCORED",
    );
    if (!status || !statusOptions.some(([value]) => value === status)) return;
    const rawScore =
      status === "SCORED"
        ? window.prompt(`分数（0-${item.maxScore}）`, current?.score ?? "")
        : null;
    if (status === "SCORED" && (rawScore === null || rawScore.trim() === ""))
      return;
    const reason = window.prompt("请填写修正原因（必填）", "教师人工录入");
    if (!reason?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(
        `/api/teacher/gradebooks/${gradebookId}/items/${item.id}/students/${student.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            score: status === "SCORED" ? Number(rawScore) : null,
            reason,
            expectedRevisionNumber: current?.revisionNumber ?? 0,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "录入失败。");
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("idempotencyKey", crypto.randomUUID());
    try {
      setPreview(
        (await requestJson(`/api/teacher/gradebooks/${gradebookId}/imports`, {
          method: "POST",
          body: form,
        })) as typeof preview,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "预览失败。");
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <div className="rounded-xl border bg-white p-6">
        {error ?? "正在加载成绩台账…"}
      </div>
    );
  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            重试
          </button>
        </div>
      ) : null}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">{data.gradebook.classroom.name}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {data.currentPublication
            ? `当前正式成绩版本 ${data.currentPublication.versionNumber}`
            : "尚未发布正式成绩"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled={busy}
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() =>
              void action(`/api/teacher/gradebooks/${gradebookId}/recalculate`)
            }
          >
            重新计算
          </button>
          <button
            disabled={busy}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white"
            onClick={() =>
              void action(`/api/teacher/gradebooks/${gradebookId}/publish`)
            }
          >
            发布正式成绩
          </button>
          <a
            className="rounded-md border px-3 py-2 text-sm"
            href={`/api/teacher/gradebooks/${gradebookId}/export`}
          >
            导出固定模板
          </a>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">平台作业同步</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={componentId}
            onChange={(event) => setComponentId(event.target.value)}
          >
            <option value="">选择考核项目</option>
            {platformComponents.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={assignmentId}
            onChange={(event) => setAssignmentId(event.target.value)}
          >
            <option value="">选择已发布作业</option>
            {data.assignments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}（{item.status}）
              </option>
            ))}
          </select>
          <button
            disabled={busy || !componentId || !assignmentId}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            onClick={() =>
              void action(
                `/api/teacher/gradebooks/${gradebookId}/platform-sync`,
                { componentId, assignmentId },
              )
            }
          >
            同步正式结果
          </button>
        </div>
      </section>
      <section className="overflow-x-auto rounded-xl border bg-white p-5">
        <h2 className="font-semibold">班级成绩明细</h2>
        {data.students.length ? (
          <table className="mt-3 min-w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">学号 / 姓名</th>
                {data.items.map((item) => (
                  <th className="p-2" key={item.id}>
                    {item.name}
                    <span className="block text-xs font-normal text-gray-500">
                      满分 {item.maxScore}
                    </span>
                  </th>
                ))}
                <th className="p-2">总评</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((student) => (
                <tr className="border-b" key={student.id}>
                  <td className="p-2">
                    {student.studentNo ?? "—"}
                    <br />
                    {student.displayName}
                  </td>
                  {data.items.map((item) => {
                    const current = item.entries.find(
                      (entry) => entry.studentId === student.id,
                    )?.revisions[0];
                    return (
                      <td className="p-2" key={item.id}>
                        <button
                          className="rounded border px-2 py-1 text-left"
                          disabled={busy}
                          onClick={() => void edit(item, student)}
                        >
                          {current
                            ? current.status === "SCORED"
                              ? current.score
                              : current.status
                            : "未录入"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-2">
                    {student.latestGrade
                      ? student.latestGrade.effectiveStatus === "SCORED"
                        ? student.latestGrade.effectiveScore
                        : student.latestGrade.effectiveStatus
                      : "待计算"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-gray-500">班级暂无在读学生。</p>
        )}
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">固定成绩模板导入</h2>
        <p className="mt-1 text-sm text-gray-500">
          先严格预览；确认执行前不会写入正式成绩。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button
            disabled={busy || !file}
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => void upload()}
          >
            上传并预览
          </button>
        </div>
        {preview ? (
          <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
            <p>
              有效 {preview.validRows} 行，错误 {preview.invalidRows} 行。
            </p>
            {preview.rows
              .filter((row) => row.previewStatus !== "VALID")
              .slice(0, 20)
              .map((row) => (
                <p className="mt-1 text-red-700" key={row.rowNumber}>
                  第 {row.rowNumber} 行（{row.studentNo || "无学号"}）：
                  {row.errorDetail?.message ?? row.previewStatus}
                </p>
              ))}
            <button
              disabled={busy || preview.invalidRows > 0}
              className="mt-3 rounded-md bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              onClick={() =>
                void action(`/api/teacher/grade-imports/${preview.id}/execute`)
              }
            >
              确认执行
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
