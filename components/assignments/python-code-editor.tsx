import type { ComponentProps } from "react";

export function PythonCodeEditor(
  props: Pick<ComponentProps<"textarea">, "disabled" | "onChange" | "value">,
) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0e1c2b]">
      <div className="flex items-center justify-between gap-2 bg-[#162a3e] px-4 py-2.5 font-mono text-xs text-slate-200">
        <span>main.py</span>
        <span>Python</span>
      </div>
      <textarea
        aria-label="Python 代码"
        autoCapitalize="off"
        autoCorrect="off"
        className="block min-h-72 w-full resize-y bg-transparent px-4 py-3 font-mono text-sm leading-6 text-slate-100 caret-sky-300 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-60 xl:min-h-96"
        spellCheck={false}
        {...props}
      />
    </div>
  );
}
