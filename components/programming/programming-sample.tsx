"use client";

import React, { useState } from "react";

export interface PublicProgrammingSample {
  stdin: string;
  expectedOutput: string;
}

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
    <section className="mt-5 space-y-3" aria-label="输入输出样例">
      <h3 className="text-lg font-bold text-slate-900">输入输出样例</h3>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {[
          { label: "输入", value: sample.stdin },
          { label: "输出", value: sample.expectedOutput },
        ].map((item) => (
          <div className="min-w-0" key={item.label}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-500">
                {item.label} #1
              </span>
              <button
                className="rounded border border-sky-300 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
                type="button"
                onClick={() => void copy(item.value, item.label)}
                aria-label={`复制样例${item.label}`}
              >
                复制
              </button>
            </div>
            <pre className="min-h-12 max-w-full overflow-x-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-sm whitespace-pre">
              <code>{item.value || "（空）"}</code>
            </pre>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        正式提交将使用多个测试用例检测，隐藏用例不公开。
      </p>
      <p className="text-xs text-sky-700" role="status">
        {message}
      </p>
    </section>
  );
}
