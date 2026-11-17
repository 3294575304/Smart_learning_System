import { cn } from "@/lib/utils";

/**
 * 编程题测试点的统一呈现。
 *
 * 公开样例运行（`programming-question-input`）与正式判题（`programming-attempt-status`）
 * 共用同一套判定芯片，避免两处各写一遍用例渲染、判定缩写与配色各说各话。
 *
 * 约束：
 * - 任何状态必须「判定缩写 + 颜色」同时出现，不能只靠颜色传达结果（沿用 StatusChip 的硬约束）。
 * - 输出只折叠展示，不默认铺开，避免多用例时把页面撑长。
 */
export interface ProgrammingTestResult {
  index: number;
  passed: boolean;
  errorType: string;
  safeErrorSummary: string | null;
  /** P1 起由服务端下发；缺失时不显示耗时/内存，而不是显示 0。 */
  resourceUsage?: {
    wallTimeMs: number;
    peakMemoryBytes: number | null;
  } | null;
  stdout?: string | null;
  stderr?: string | null;
  score?: number | null;
  maxScore?: number | null;
}

const VERDICTS: Record<string, string> = {
  NONE: "AC",
  WRONG_ANSWER: "WA",
  SYNTAX_ERROR: "CE",
  COMPILE_ERROR: "CE",
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

/** 这些不是学生的错，用中性色，避免看起来像答案错误。 */
const NEUTRAL_ERRORS = new Set(["SYSTEM_ERROR", "INTERNAL_ERROR", "CANCELLED"]);

const LEGEND =
  "AC 通过 · WA 答案错误 · CE 编译/语法错误 · RE 运行错误 · TLE 超时 · MLE 内存超限";

function verdictOf(item: ProgrammingTestResult) {
  if (item.passed) return "AC";
  return VERDICTS[item.errorType] ?? "WA";
}

function chipTone(item: ProgrammingTestResult) {
  if (item.passed) return "border-emerald-100 bg-ok-soft text-ok";
  if (NEUTRAL_ERRORS.has(item.errorType))
    return "border-line bg-muted text-ink-soft";
  return "border-rose-100 bg-bad-soft text-bad";
}

function usageText(usage: ProgrammingTestResult["resourceUsage"]) {
  if (!usage) return null;
  const memory =
    usage.peakMemoryBytes === null
      ? "—"
      : `${(usage.peakMemoryBytes / 1024).toFixed(1)}KB`;
  return `${usage.wallTimeMs}ms / ${memory}`;
}

/** 正式判题看每例得分，公开样例运行看耗时内存；两者都没有时不占位。 */
function metaText(item: ProgrammingTestResult, showScore: boolean) {
  if (showScore && item.score != null && item.maxScore != null)
    return `${item.score}/${item.maxScore} 分`;
  return usageText(item.resourceUsage);
}

function caseLabel(item: ProgrammingTestResult, showScore: boolean) {
  const parts = [
    `用例 ${item.index}：${item.passed ? "通过" : (item.safeErrorSummary ?? "未通过")}`,
  ];
  const usage = usageText(item.resourceUsage);
  if (usage) parts.push(`耗时 / 内存 ${usage}`);
  if (showScore && item.score != null && item.maxScore != null)
    parts.push(`得分 ${item.score} / ${item.maxScore}`);
  return parts.join("，");
}

export function ProgrammingTestResults({
  cases,
  showScore = false,
}: {
  cases: ProgrammingTestResult[];
  /** 正式判题传 true：芯片第二行显示每例得分，而不是耗时内存。 */
  showScore?: boolean;
}) {
  if (cases.length === 0) return null;
  const passed = cases.filter((item) => item.passed).length;
  const withOutput = cases.filter((item) => item.stdout || item.stderr);

  return (
    <section
      aria-label="测试点信息"
      className="border-line bg-card rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-ink text-sm font-semibold">测试点信息</h3>
        <span className="text-ink-soft text-xs tabular-nums" aria-live="polite">
          通过 {passed} / {cases.length}
        </span>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {cases.map((item) => {
          const meta = metaText(item, showScore);
          return (
            <li
              className={cn(
                "relative flex min-h-12 w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border pt-3 pb-1.5",
                chipTone(item),
              )}
              key={item.index}
              title={caseLabel(item, showScore)}
            >
              <span className="absolute top-1 left-1.5 text-[10px] font-medium tabular-nums opacity-70">
                #{item.index}
              </span>
              <strong className="text-sm leading-5 font-semibold">
                {verdictOf(item)}
              </strong>
              {meta ? (
                <span className="max-w-full truncate px-1 text-[10px] leading-3.5 tabular-nums opacity-80">
                  {meta}
                </span>
              ) : null}
              <span className="sr-only">{caseLabel(item, showScore)}</span>
            </li>
          );
        })}
      </ul>

      <p className="text-ink-muted mt-3 text-xs">{LEGEND}</p>

      {withOutput.length > 0 ? (
        <div className="mt-3 space-y-2">
          {withOutput.map((item) => (
            <details
              className="border-line-soft bg-page rounded-lg border px-3 py-2"
              key={item.index}
            >
              <summary className="text-ink-soft cursor-pointer text-xs font-medium">
                用例 #{item.index} 运行输出
              </summary>
              {item.stdout ? (
                <pre className="text-ink mt-2 overflow-auto text-xs whitespace-pre-wrap">
                  {item.stdout}
                </pre>
              ) : null}
              {item.stderr ? (
                <pre className="text-bad mt-2 overflow-auto text-xs whitespace-pre-wrap">
                  {item.stderr}
                </pre>
              ) : null}
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}
