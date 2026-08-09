"use client";

import { ProgrammingTestVisibility } from "@prisma/client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { requestQuestionApi } from "@/components/questions/request-api";

interface TestCaseDraft {
  visibility: ProgrammingTestVisibility;
  name: string;
  stdin: string;
  expectedOutput: string;
  points: number;
  sortOrder: number;
}

interface ConfigDto {
  revisionNumber: number;
  standardCode: string;
  starterCode: string;
  totalPoints: number;
  configurationHash: string;
  testCasesHash: string;
  executorRuleVersion: string;
  limits: {
    cpuTimeMs: number;
    wallTimeMs: number;
    memoryBytes: number;
    outputBytes: number;
    processCount: number;
  };
  testCases: TestCaseDraft[];
}

const defaultCases: TestCaseDraft[] = [
  {
    visibility: ProgrammingTestVisibility.PUBLIC,
    name: "公开样例 1",
    stdin: "",
    expectedOutput: "",
    points: 2,
    sortOrder: 1,
  },
  {
    visibility: ProgrammingTestVisibility.HIDDEN,
    name: "隐藏用例 1",
    stdin: "",
    expectedOutput: "",
    points: 8,
    sortOrder: 2,
  },
];

export function ProgrammingConfigPanel({ questionId }: { questionId: string }) {
  const endpoint = `/api/teacher/questions/${questionId}/programming-config`;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [standardCode, setStandardCode] = useState("print(input())\n");
  const [starterCode, setStarterCode] = useState("# 在这里编写代码\n");
  const [totalPoints, setTotalPoints] = useState(10);
  const [limits, setLimits] = useState({
    cpuTimeMs: 1_000,
    wallTimeMs: 2_000,
    memoryBytes: 64 * 1024 * 1024,
    outputBytes: 16 * 1024,
    processCount: 2,
  });
  const [testCases, setTestCases] = useState<TestCaseDraft[]>(defaultCases);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await requestQuestionApi<ConfigDto | null>(endpoint);
    if (!response.success) {
      setError(response.error);
      setLoading(false);
      return;
    }
    if (response.data) {
      setRevision(response.data.revisionNumber);
      setStandardCode(response.data.standardCode);
      setStarterCode(response.data.starterCode);
      setTotalPoints(response.data.totalPoints);
      setLimits(response.data.limits);
      setTestCases(response.data.testCases);
    }
    setLoading(false);
  }, [endpoint]);

  useEffect(() => void load(), [load]);

  const caseTotal = useMemo(
    () => testCases.reduce((sum, item) => sum + Number(item.points || 0), 0),
    [testCases],
  );

  function updateCase(index: number, patch: Partial<TestCaseDraft>) {
    setTestCases((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  async function save() {
    if (Math.round(caseTotal * 100) !== Math.round(totalPoints * 100)) {
      setError("测试用例分值总和必须等于题目总分");
      return;
    }
    if (
      !testCases.some(
        (item) => item.visibility === ProgrammingTestVisibility.PUBLIC,
      ) ||
      !testCases.some(
        (item) => item.visibility === ProgrammingTestVisibility.HIDDEN,
      )
    ) {
      setError("至少需要一个公开样例和一个隐藏用例");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const response = await requestQuestionApi<ConfigDto>(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        standardCode,
        starterCode,
        totalPoints,
        limits,
        testCases: testCases.map((item, index) => ({
          ...item,
          points: Number(item.points),
          sortOrder: index + 1,
        })),
      }),
    });
    setSaving(false);
    if (!response.success) {
      setError(response.error);
      return;
    }
    setRevision(response.data.revisionNumber);
    setSuccess(`已保存不可变修订 ${response.data.revisionNumber}`);
  }

  return (
    <section className="space-y-5 rounded-xl border bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold">Python 判题配置</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {revision === null ? "尚无配置修订" : `当前修订 ${revision}`}
          。历史作业继续引用发布时冻结的修订。
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">正在加载判题配置…</p>
      ) : null}
      {error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}{" "}
          <button
            className="underline"
            onClick={() => void load()}
            type="button"
          >
            重试加载
          </button>
        </div>
      ) : null}
      {!loading ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">初始代码</span>
              <textarea
                className="min-h-40 w-full rounded-md border p-3 font-mono text-sm"
                value={starterCode}
                onChange={(event) => setStarterCode(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">
                标准代码（仅教师可见）
              </span>
              <textarea
                className="min-h-40 w-full rounded-md border p-3 font-mono text-sm"
                value={standardCode}
                onChange={(event) => setStandardCode(event.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["题目总分", "totalPoints", totalPoints],
                ["CPU ms", "cpuTimeMs", limits.cpuTimeMs],
                ["墙钟 ms", "wallTimeMs", limits.wallTimeMs],
                ["内存 bytes", "memoryBytes", limits.memoryBytes],
                ["输出 bytes", "outputBytes", limits.outputBytes],
                ["进程数", "processCount", limits.processCount],
              ] as const
            ).map(([label, key, value]) => (
              <label className="space-y-1" key={key}>
                <span className="text-xs text-gray-600">{label}</span>
                <input
                  className="w-full rounded-md border px-2 py-2 text-sm"
                  min={1}
                  type="number"
                  value={value}
                  onChange={(event) =>
                    key === "totalPoints"
                      ? setTotalPoints(Number(event.target.value))
                      : setLimits((current) => ({
                          ...current,
                          [key]: Number(event.target.value),
                        }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-medium">
                测试用例（合计 {caseTotal} / {totalPoints} 分）
              </h3>
              <button
                className="rounded-md border px-3 py-2 text-sm"
                type="button"
                onClick={() =>
                  setTestCases((current) => [
                    ...current,
                    {
                      visibility: ProgrammingTestVisibility.HIDDEN,
                      name: `用例 ${current.length + 1}`,
                      stdin: "",
                      expectedOutput: "",
                      points: 1,
                      sortOrder: current.length + 1,
                    },
                  ])
                }
              >
                添加用例
              </button>
            </div>
            {testCases.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-500">
                暂无测试用例。
              </p>
            ) : null}
            {testCases.map((testCase, index) => (
              <div
                className="grid gap-3 rounded-lg border p-4 md:grid-cols-2"
                key={`${testCase.sortOrder}-${index}`}
              >
                <div className="flex gap-3 md:col-span-2">
                  <select
                    className="rounded-md border px-2 py-2 text-sm"
                    value={testCase.visibility}
                    onChange={(event) =>
                      updateCase(index, {
                        visibility: event.target
                          .value as ProgrammingTestVisibility,
                      })
                    }
                  >
                    <option value={ProgrammingTestVisibility.PUBLIC}>
                      公开样例
                    </option>
                    <option value={ProgrammingTestVisibility.HIDDEN}>
                      隐藏用例
                    </option>
                  </select>
                  <input
                    className="flex-1 rounded-md border px-3 py-2"
                    value={testCase.name}
                    onChange={(event) =>
                      updateCase(index, { name: event.target.value })
                    }
                  />
                  <input
                    className="w-24 rounded-md border px-2 py-2"
                    min={0.01}
                    step="0.01"
                    type="number"
                    value={testCase.points}
                    onChange={(event) =>
                      updateCase(index, { points: Number(event.target.value) })
                    }
                  />
                  <button
                    className="text-sm text-red-600"
                    type="button"
                    onClick={() =>
                      setTestCases((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    移除
                  </button>
                </div>
                <label className="space-y-1">
                  <span className="text-xs text-gray-600">标准输入</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border p-2 font-mono text-sm"
                    value={testCase.stdin}
                    onChange={(event) =>
                      updateCase(index, { stdin: event.target.value })
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-gray-600">期望输出</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border p-2 font-mono text-sm"
                    value={testCase.expectedOutput}
                    onChange={(event) =>
                      updateCase(index, { expectedOutput: event.target.value })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
          {success ? (
            <p className="rounded-md bg-green-50 p-3 text-sm text-green-700">
              {success}
            </p>
          ) : null}
          <button
            className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "保存修订中…" : "保存新修订"}
          </button>
        </>
      ) : null}
    </section>
  );
}
