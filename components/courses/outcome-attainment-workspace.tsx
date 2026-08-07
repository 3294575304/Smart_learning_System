"use client";
import { useCallback, useEffect, useState } from "react";
type Student = {
  id: string;
  status: string;
  score: string | null;
  attained: boolean | null;
  student: {
    profile: { studentNo: string | null; displayName: string | null } | null;
  };
};
type Result = {
  id: string;
  outcomeCode: string;
  outcomeTitle: string;
  threshold: string;
  meanScore: string | null;
  attainmentIndex: string | null;
  attained: boolean | null;
  participantCount: number;
  excludedCount: number;
  students: Student[];
};
type Run = {
  id: string;
  versionNumber: number;
  calculatedAt: string;
  isStale: boolean;
  sourceSyllabusStructureId: string;
  results: Result[];
};
async function json(url: string, init?: RequestInit) {
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
export function OutcomeAttainmentWorkspace({
  gradebookId,
}: {
  gradebookId: string;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setError(null);
      const data = (await json(
        `/api/teacher/gradebooks/${gradebookId}/outcome-attainment`,
      )) as { runs: Run[] };
      setRuns(data.runs);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败。");
    }
  }, [gradebookId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function generate() {
    setBusy(true);
    try {
      await json(`/api/teacher/gradebooks/${gradebookId}/outcome-attainment`, {
        method: "POST",
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "计算失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            重试
          </button>
        </div>
      ) : null}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">生成正式达成度版本</h2>
        <p className="mt-1 text-sm text-gray-500">
          仅使用正式教学大纲课程目标、正式考核映射和正式成绩证据；重复输入幂等复用。
        </p>
        <button
          disabled={busy}
          className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm text-white"
          onClick={() => void generate()}
        >
          {busy ? "正在计算…" : "生成/复算达成度"}
        </button>
      </section>
      {runs.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
          暂无达成度版本。
        </div>
      ) : (
        runs.map((run) => (
          <section className="rounded-xl border bg-white p-5" key={run.id}>
            <h2 className="font-semibold">
              达成度版本 {run.versionNumber}
              {run.isStale ? (
                <span className="ml-2 text-sm text-amber-700">已过期</span>
              ) : (
                <span className="ml-2 text-sm text-emerald-700">当前</span>
              )}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              来源正式大纲结构 {run.sourceSyllabusStructureId} ·{" "}
              {new Date(run.calculatedAt).toLocaleString("zh-CN")}
            </p>
            {run.results.map((result) => (
              <details className="mt-4 rounded-lg border p-4" key={result.id}>
                <summary className="cursor-pointer">
                  <span className="font-medium">
                    {result.outcomeCode} {result.outcomeTitle}
                  </span>
                  <span className="ml-3">
                    班级均值 {result.meanScore ?? "证据不足"} / 阈值{" "}
                    {result.threshold} ·{" "}
                    {result.attained === null
                      ? "无法判定"
                      : result.attained
                        ? "已达成"
                        : "未达成"}
                  </span>
                </summary>
                <p className="mt-2 text-sm text-gray-500">
                  参与 {result.participantCount} 人，排除 {result.excludedCount}{" "}
                  人；达成指数 {result.attainmentIndex ?? "—"}
                </p>
                {result.students.map((student) => (
                  <p className="mt-2 border-t pt-2 text-sm" key={student.id}>
                    {student.student.profile?.studentNo ?? "—"}{" "}
                    {student.student.profile?.displayName ?? "未命名"}：
                    {student.status === "INCLUDED"
                      ? `${student.score}（${student.attained ? "达成" : "未达成"}）`
                      : student.status}
                  </p>
                ))}
              </details>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
