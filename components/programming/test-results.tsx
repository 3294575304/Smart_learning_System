import React from "react";
export interface ProgrammingTestResult {
  index: number;
  passed: boolean;
  errorType: string;
  safeErrorSummary: string | null;
  resourceUsage?: { wallTimeMs: number; peakMemoryBytes: number | null } | null;
  stdout?: string;
  stderr?: string;
}

const verdicts: Record<string, string> = {
  NONE: "AC",
  WRONG_ANSWER: "WA",
  SYNTAX_ERROR: "CE",
  RUNTIME_ERROR: "RE",
  TIME_LIMIT: "TLE",
  MEMORY_LIMIT: "MLE",
  OUTPUT_LIMIT: "OLE",
  PROCESS_LIMIT: "PLE",
  SECURITY_VIOLATION: "SE",
  SYSTEM_ERROR: "JE",
  INTERNAL_ERROR: "JE",
  CANCELLED: "取消",
};

export function ProgrammingTestResults({
  cases,
}: {
  cases: ProgrammingTestResult[];
}) {
  if (!cases.length) return null;
  const passed = cases.filter((item) => item.passed).length;
  return (
    <section
      className="bg-card text-card-foreground space-y-3 rounded-md border p-4"
      aria-label="测试点信息"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">测试点信息</h3>
        <span className="text-muted-foreground text-xs">
          通过 {passed} / {cases.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {cases.map((item) => (
          <div
            key={item.index}
            className={`relative flex h-[76px] w-20 flex-col items-center justify-center gap-0.5 rounded border px-1 pt-3 ${item.passed ? "border-[#cbd7c8] bg-[#edf2e9] text-[#496b50]" : item.errorType === "SYSTEM_ERROR" || item.errorType === "INTERNAL_ERROR" || item.errorType === "CANCELLED" ? "border-border bg-muted text-muted-foreground" : "border-[#dec9bf] bg-[#f7eee7] text-[#93432e]"}`}
            aria-label={`测试点 ${item.index}：${item.passed ? "通过" : (item.safeErrorSummary ?? "未通过")}`}
            title={item.passed ? "通过" : (item.safeErrorSummary ?? "未通过")}
          >
            <span className="absolute top-1 left-1.5 text-[10px] font-medium opacity-70">
              #{item.index}
            </span>
            <strong className="text-base leading-5">
              {item.passed ? "AC" : (verdicts[item.errorType] ?? "WA")}
            </strong>
            <span className="text-center text-[10px] leading-3.5 tabular-nums">
              {item.resourceUsage
                ? `${item.resourceUsage.wallTimeMs}ms / ${item.resourceUsage.peakMemoryBytes === null ? "—" : `${(item.resourceUsage.peakMemoryBytes / 1024).toFixed(1)}KB`}`
                : "耗时 / 内存暂无数据"}
            </span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        AC 通过 · WA 答案错误 · CE 编译/语法错误 · RE 运行错误 · TLE 超时 · MLE
        内存超限
      </p>
      {cases
        .filter((item) => item.stdout || item.stderr)
        .map((item) => (
          <details
            className="bg-background rounded border p-3 text-sm"
            key={item.index}
          >
            <summary className="cursor-pointer font-medium">
              公开样例的运行输出
            </summary>
            {item.stdout ? (
              <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                {item.stdout}
              </pre>
            ) : null}
            {item.stderr ? (
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-red-700">
                {item.stderr}
              </pre>
            ) : null}
          </details>
        ))}
    </section>
  );
}
