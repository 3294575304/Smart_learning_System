"use client";

import { useState } from "react";

/** 只包含第一条 PUBLIC 用例，隐藏用例不会下发到前端。 */
export interface PublicProgrammingSample {
  stdin: string;
  expectedOutput: string;
}

/**
 * 输入输出样例。
 *
 * 学生最常做的动作是把样例输入抄进脑子里手打一遍，所以每个块都配了复制按钮；
 * 复制失败时给出可执行的替代说明，而不是只报「失败」。
 */
export function ProgrammingSample({
  sample,
}: {
  sample: PublicProgrammingSample;
}) {
  const [message, setMessage] = useState("");

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label}已复制`);
    } catch {
      setMessage("复制失败，请选中文本后手动复制。");
    }
  }

  return (
    <section className="mt-4 space-y-2" aria-label="输入输出样例">
      <h4 className="text-ink text-sm font-semibold">输入输出样例</h4>
      <div className="grid min-w-0 gap-3 @min-[19rem]:grid-cols-2">
        {[
          { label: "输入", value: sample.stdin },
          { label: "输出", value: sample.expectedOutput },
        ].map((item) => (
          <div className="min-w-0" key={item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-ink-soft text-xs font-medium">
                {item.label} #1
              </span>
              <button
                aria-label={`复制样例${item.label}`}
                className="rounded border border-sky-200 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700"
                onClick={() => void copy(item.value, item.label)}
                type="button"
              >
                复制
              </button>
            </div>
            <pre className="border-line bg-page text-ink max-h-40 min-h-11 overflow-auto rounded border p-2.5 font-mono text-xs whitespace-pre">
              <code>{item.value || "（空）"}</code>
            </pre>
          </div>
        ))}
      </div>
      <p className="text-ink-muted text-xs">
        正式提交将使用多个测试用例检测，隐藏用例不公开。
      </p>
      <p className="text-ink-soft text-xs" role="status">
        {message}
      </p>
    </section>
  );
}
