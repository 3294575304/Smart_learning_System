"use client";

import { useState } from "react";

/** 只包含 PUBLIC 检查点，隐藏用例不会下发到前端。 */
export interface PublicProgrammingSample {
  name: string;
  stdin: string;
  expectedOutput: string;
}

/**
 * 公开输入输出检查点。
 *
 * 所有公开检查点直接展开，输入和预期输出并排呈现；复制失败时给出手动复制说明。
 */
export function ProgrammingSample({
  samples,
}: {
  samples: PublicProgrammingSample[];
}) {
  const [message, setMessage] = useState("");

  async function copy(value: string, label: string, checkpoint: number) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`检查点 ${checkpoint} 的${label}已复制`);
    } catch {
      setMessage("复制失败，请选中文本后手动复制。");
    }
  }

  return (
    <section className="mt-4 space-y-2" aria-label="公开检查点">
      <h4 className="text-ink text-sm font-semibold">公开检查点</h4>
      <div className="space-y-3">
        {samples.map((sample, index) => {
          const checkpoint = index + 1;
          return (
            <div
              className="border-line-soft border-b pb-3 last:border-b-0"
              key={`${sample.name}:${checkpoint}`}
            >
              <h5 className="text-ink-soft text-xs font-medium">
                检查点 #{checkpoint} · {sample.name}
              </h5>
              <div className="mt-3 grid min-w-0 gap-3 @min-[19rem]:grid-cols-2">
                {[
                  { label: "输入", value: sample.stdin },
                  { label: "预期输出", value: sample.expectedOutput },
                ].map((item) => (
                  <div className="min-w-0" key={item.label}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-ink-soft text-xs font-medium">
                        {item.label}
                      </span>
                      <button
                        aria-label={`复制检查点 ${checkpoint} 的${item.label}`}
                        className="rounded border border-sky-200 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700"
                        onClick={() =>
                          void copy(item.value, item.label, checkpoint)
                        }
                        type="button"
                      >
                        复制
                      </button>
                    </div>
                    <pre className="border-line bg-card text-ink max-h-40 min-h-11 overflow-auto rounded border px-2.5 py-2 font-mono text-xs whitespace-pre">
                      <code>{item.value || "（空）"}</code>
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {message ? (
        <p className="text-ink-soft text-xs" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
