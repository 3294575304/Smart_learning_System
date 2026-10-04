"use client";
import { useRememberedSelection } from "@/components/dashboard/navigation-memory";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, RefreshCw, Send, ArrowUpRight } from "lucide-react";
import { correctGradeEntrySchema } from "@/services/gradebook/schemas";

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
    componentResultsJson?: Array<{
      componentId: string;
      score: string | null;
      status: string;
    }>;
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
      components: Array<{
        id: string;
        name: string;
        sourceType: string;
        weight: string;
      }>;
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

export function GradebookWorkspace({
  gradebookId,
  courseId,
}: {
  gradebookId: string;
  courseId: string;
}) {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [section, setSection] = useRememberedSelection<"grades" | "sources">(
    "gradebook-section",
    "grades",
    ["grades", "sources"],
  );
  const [needsCalculation, setNeedsCalculation] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{
    item: Item;
    student: Student;
    status: string;
    score: string;
    reason: string;
    expectedRevisionNumber: number;
    idempotencyKey: string;
  } | null>(null);
  const [componentId, setComponentId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [fileInputVersion, setFileInputVersion] = useState(0);
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
    try {
      setData(
        (await requestJson(
          `/api/teacher/gradebooks/${gradebookId}`,
        )) as Workspace,
      );
      setError(null);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败。");
      return false;
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
    if (busy) return;
    if (
      url.endsWith("/execute") &&
      !window.confirm(
        "确认将预览中的有效成绩导入台账？导入后需核对总评并重新发布。",
      )
    )
      return;
    if (
      url.endsWith("/publish") &&
      !window.confirm(
        "发布时会自动重新计算全部学生成绩，并向学生发布正式结果。确认已核对分项成绩与特殊状态？",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await requestJson(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const refreshed = await load();
      const isCalculated =
        url.endsWith("/recalculate") || url.endsWith("/publish");
      setNeedsCalculation(!isCalculated);
      if (url.endsWith("/execute")) {
        setPreview(null);
        setFile(null);
        setFileInputVersion((value) => value + 1);
      }
      if (refreshed)
        setMessage(
          url.endsWith("/publish")
            ? "已重新计算并发布正式成绩，可导出完整成绩单。"
            : url.endsWith("/recalculate")
              ? "总评已更新，核对后可发布正式成绩。"
              : "成绩已更新，请计算总评后核对。",
        );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }
  function edit(item: Item, student: Student) {
    const current = item.entries.find((entry) => entry.studentId === student.id)
      ?.revisions[0];
    setEditing({
      item,
      student,
      status: current?.status ?? "SCORED",
      score: current?.score ?? "",
      reason: "",
      expectedRevisionNumber: current?.revisionNumber ?? 0,
      idempotencyKey: crypto.randomUUID(),
    });
    setError(null);
    setMessage(null);
  }
  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const {
      item,
      student,
      status,
      score,
      reason,
      expectedRevisionNumber,
      idempotencyKey,
    } = editing;
    const input = correctGradeEntrySchema.safeParse({
      status,
      score: status === "SCORED" && score.trim() ? Number(score) : null,
      reason,
      expectedRevisionNumber,
      idempotencyKey,
    });
    if (!input.success) {
      setError("请检查成绩状态、分数和修正原因。");
      return;
    }
    if (input.data.score !== null && input.data.score > Number(item.maxScore)) {
      setError(`分数不能超过满分 ${item.maxScore}。`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestJson(
        `/api/teacher/gradebooks/${gradebookId}/items/${item.id}/students/${student.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.data),
        },
      );
      const refreshed = await load();
      setNeedsCalculation(true);
      setEditing(null);
      if (refreshed)
        setMessage("成绩已保存。请重新计算总评，确认后发布正式版本。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "录入失败。");
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!file || busy) return;
    setPreview(null);
    setMessage(null);
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

  const filteredStudents = (data?.students ?? []).filter((student) =>
    `${student.studentNo ?? ""} ${student.displayName}`
      .toLowerCase()
      .includes(keyword.trim().toLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / 20));
  const currentPage = Math.min(page, totalPages);
  const visibleStudents = filteredStudents.slice(
    (currentPage - 1) * 20,
    currentPage * 20,
  );
  const visibleItems = (data?.items ?? []).filter(
    (item) => !itemFilter || item.componentId === itemFilter,
  );
  const statusLabel = (value: string) =>
    statusOptions.find(([status]) => status === value)?.[1] ?? "其他";
  if (!data)
    return (
      <div className="rounded-xl border bg-white p-6">
        {error ?? "正在加载成绩台账…"}
        {error && (
          <button className="ml-3 underline" onClick={() => void load()}>
            重试
          </button>
        )}
      </div>
    );
  return (
    <div className="space-y-6">
      {message && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {message}
        </div>
      )}
      {editing && (
        <form
          onSubmit={saveEdit}
          className="sticky top-20 z-20 space-y-3 rounded-xl border border-sky-200 bg-white p-5 shadow-lg"
        >
          <h2 className="font-semibold">
            修改成绩 · {editing.student.displayName} · {editing.item.name}
          </h2>
          <p className="text-xs text-slate-500">
            满分 {editing.item.maxScore}
            ，修改保留历史修订；不会自动覆盖已发布的正式成绩。
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              成绩状态
              <select
                disabled={busy}
                value={editing.status}
                onChange={(e) =>
                  setEditing({ ...editing, status: e.target.value })
                }
                className="block w-full rounded-md border p-2"
              >
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              分数
              <input
                type="number"
                step="any"
                min="0"
                max={editing.item.maxScore}
                required={editing.status === "SCORED"}
                disabled={busy || editing.status !== "SCORED"}
                value={editing.status === "SCORED" ? editing.score : ""}
                onChange={(e) =>
                  setEditing({ ...editing, score: e.target.value })
                }
                className="block w-full rounded-md border p-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              修正原因
              <input
                required
                maxLength={500}
                disabled={busy}
                value={editing.reason}
                onChange={(e) =>
                  setEditing({ ...editing, reason: e.target.value })
                }
                className="block w-full rounded-md border p-2"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              disabled={busy}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white"
            >
              {busy ? "保存中…" : "保存修订"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
              className="rounded-md border px-4 py-2 text-sm"
            >
              取消
            </button>
          </div>
        </form>
      )}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            重试
          </button>
        </div>
      ) : null}
      <section className="rounded-2xl border bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {data.gradebook.classroom.name}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {data.students.length} 位学生 ·{" "}
              {data.gradebook.scheme.components.length} 项考核
            </p>
          </div>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-sm text-sky-700">
            {data.currentPublication
              ? `已发布 v${data.currentPublication.versionNumber}`
              : "待发布"}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          <button
            disabled={busy || !data.students.length}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm disabled:opacity-50"
            onClick={() =>
              void action(`/api/teacher/gradebooks/${gradebookId}/recalculate`)
            }
          >
            <RefreshCw size={16} />
            计算总评
          </button>
          <button
            disabled={busy || !data.students.length}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm text-white disabled:opacity-50"
            onClick={() =>
              void action(`/api/teacher/gradebooks/${gradebookId}/publish`)
            }
          >
            <Send size={16} />
            {busy ? "正在处理…" : "发布正式成绩"}
          </button>
          {data.currentPublication ? (
            <a
              className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-700"
              href={`/api/teacher/gradebooks/${gradebookId}/export`}
            >
              <Download size={16} />
              导出完整成绩单
            </a>
          ) : (
            <span className="text-sm text-slate-500">发布后可导出成绩单</span>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {needsCalculation
            ? "分项已修改，总评待更新。发布时会自动重新计算。"
            : "先核对分项与总评，再发布。导出采用最近一次正式发布的成绩。"}
        </p>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-xl border bg-white p-1"
          role="group"
          aria-label="台账工作区"
        >
          {(
            [
              ["grades", "成绩明细"],
              ["sources", "同步与导入"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={section === value}
              onClick={() => setSection(value)}
              className={`rounded-lg px-5 py-2.5 text-sm ${section === value ? "bg-sky-600 font-medium text-white" : "text-slate-600 hover:bg-sky-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Link
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm text-sky-700"
          href={`/teacher/courses/${courseId}/gradebook/${gradebookId}/outcome-attainment`}
        >
          课程目标达成度
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <section
        hidden={section !== "sources"}
        className="rounded-2xl border bg-white p-5 sm:p-6"
      >
        <h2 className="font-semibold">同步平台作业成绩</h2>
        <p className="mt-2 text-sm text-slate-500">
          选择考核项目与作业，将已发布的作答成绩同步到台账。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            className="rounded-md border px-3 py-2 text-sm"
            aria-label="同步目标考核项目"
            disabled={busy}
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
            aria-label="同步来源作业"
            disabled={busy}
            value={assignmentId}
            onChange={(event) => setAssignmentId(event.target.value)}
          >
            <option value="">选择已发布作业</option>
            {data.assignments
              .filter((item) => item.status !== "DRAFT")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
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
      <section
        hidden={section !== "grades"}
        className="rounded-2xl border bg-white p-5 sm:p-6"
      >
        <h2 className="font-semibold">班级成绩明细</h2>
        <p className="mt-1 text-xs text-slate-500">
          总览按考核项目汇总；选择项目后查看和编辑每次成绩。汇总与总评来自最近一次计算。
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            aria-label="搜索学生姓名或学号"
            placeholder="搜索姓名或学号"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            className="rounded-md border px-3 py-2 text-sm"
          />
          <select
            aria-label="筛选成绩考核项目"
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="">考核总览</option>
            {data.gradebook.scheme.components.map((component) => (
              <option key={component.id} value={component.id}>
                {component.name}
              </option>
            ))}
          </select>
          <span className="self-center text-xs text-slate-500">
            {filteredStudents.length} 位学生 ·{" "}
            {itemFilter ? `${visibleItems.length} 个成绩项` : "考核项目汇总"}
          </span>
        </div>
        <div className="mt-3 max-h-[600px] overflow-auto rounded-lg border">
          {data.students.length ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="sticky top-0 left-0 z-20 min-w-40 bg-sky-50 p-3">
                    学号 / 姓名
                  </th>
                  {!itemFilter &&
                    data.gradebook.scheme.components.map((component) => (
                      <th
                        key={component.id}
                        className="sticky top-0 z-10 min-w-32 bg-sky-50 p-3"
                      >
                        <button
                          className="text-left text-sky-700 hover:underline"
                          onClick={() => setItemFilter(component.id)}
                        >
                          {component.name}
                          <span className="block text-xs font-normal text-slate-500">
                            权重 {Number(component.weight)}% · 查看明细
                          </span>
                        </button>
                      </th>
                    ))}
                  {itemFilter &&
                    visibleItems.map((item) => (
                      <th
                        className="sticky top-0 z-10 min-w-36 bg-sky-50 p-3"
                        key={item.id}
                      >
                        {item.name}
                        <span className="block text-xs font-normal text-gray-500">
                          满分 {item.maxScore}
                        </span>
                      </th>
                    ))}
                  <th className="sticky top-0 right-0 z-20 min-w-24 bg-sky-50 p-3">
                    总评
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student) => (
                  <tr className="border-b" key={student.id}>
                    <td className="sticky left-0 z-10 bg-white p-3">
                      {student.studentNo ?? "—"}
                      <br />
                      {student.displayName}
                    </td>
                    {!itemFilter &&
                      data.gradebook.scheme.components.map((component) => {
                        const result =
                          student.latestGrade?.componentResultsJson?.find(
                            (row) => row.componentId === component.id,
                          );
                        return (
                          <td className="p-3 tabular-nums" key={component.id}>
                            {result?.score != null
                              ? Number(result.score).toFixed(2)
                              : result?.status === "EXEMPT"
                                ? "免修"
                                : "待完善"}
                          </td>
                        );
                      })}
                    {itemFilter &&
                      visibleItems.map((item) => {
                        const current = item.entries.find(
                          (entry) => entry.studentId === student.id,
                        )?.revisions[0];
                        return (
                          <td className="p-2" key={item.id}>
                            <button
                              className="rounded border px-2 py-1 text-left"
                              disabled={busy}
                              aria-label={`编辑${student.displayName}的${item.name}成绩`}
                              onClick={() => void edit(item, student)}
                            >
                              {current
                                ? current.status === "SCORED"
                                  ? current.score
                                  : statusLabel(current.status)
                                : "未录入"}
                            </button>
                          </td>
                        );
                      })}
                    <td className="sticky right-0 z-10 bg-white p-3 font-medium">
                      {student.latestGrade
                        ? student.latestGrade.effectiveStatus === "SCORED"
                          ? student.latestGrade.effectiveScore
                          : statusLabel(student.latestGrade.effectiveStatus)
                        : "待计算"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-gray-500">班级暂无在读学生。</p>
          )}
        </div>
        {data.students.length > 0 && filteredStudents.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">
            没有匹配的学生，请调整搜索条件。
          </p>
        )}
        <div className="mt-3 flex items-center justify-between text-sm">
          <span>
            第 {currentPage} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-md border px-3 py-1 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-md border px-3 py-1 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </section>
      <section
        hidden={section !== "sources"}
        className="rounded-2xl border bg-white p-5 sm:p-6"
      >
        <h2 className="font-semibold">导入外部成绩</h2>
        <p className="mt-1 text-sm text-gray-500">
          支持教务系统固定 10 列格式的 XLS/XLSX
          成绩表。先预览再确认导入；完整成绩单用于查看，不作为此处的导入模板。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            key={fileInputVersion}
            aria-label="选择外部成绩文件"
            disabled={busy}
            type="file"
            accept=".xls,.xlsx"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
            }}
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
          <div className="mt-4 rounded-lg bg-sky-50/70 p-4 text-sm">
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
              disabled={
                busy || preview.invalidRows > 0 || preview.validRows === 0
              }
              className="mt-3 rounded-md bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
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
