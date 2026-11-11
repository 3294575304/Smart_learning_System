"use client";

const presets = [
  { label: "宽松", switches: 5 },
  { label: "标准", switches: 2 },
  { label: "严格", switches: 0 },
] as const;

export function ExamRulePresets({
  switches,
  onChange,
}: {
  switches: number;
  onChange: (switches: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="切屏规则预设"
      >
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={switches === preset.switches}
            onClick={() => onChange(preset.switches)}
            className={`min-h-8 rounded-md border px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 ${switches === preset.switches ? "border-sky-600 bg-sky-50 text-sky-900" : "bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {preset.label} · {preset.switches} 次
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-600">
        超过允许次数将自动交卷。选用预设后仍可调整。
      </p>
    </div>
  );
}
