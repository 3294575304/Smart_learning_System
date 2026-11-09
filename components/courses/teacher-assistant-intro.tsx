import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TeacherAssistantMascot } from "./teacher-assistant-mascot";
import styles from "./teacher-assistant-mascot.module.css";

const steps = [
  {
    title: "你好，我是教学小助手",
    detail:
      "想找页面或办教学事项，都可以直接问我。比如“成绩台账在哪里”，我会给出可打开的入口。",
    example: "找页面 · 成绩台账在哪里？",
  },
  {
    title: "遇到问题，也可以找我",
    detail:
      "比如“学生为什么看不到作业”。我会提示先检查什么，并带你进入对应页面。需要课程或教学班时，我会再询问你。",
    example: "查问题 · 学生为什么看不到作业？",
  },
  {
    title: "把我放在顺手的位置",
    detail:
      "拖动头像就能移动位置，鼠标和手指都可以。位置会自动保存。点击头像开始提问，点击入口卡进入相应页面。",
    example: "小提示 · 聚焦头像后，也能用方向键移动。",
  },
];

export function TeacherAssistantIntro({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  return (
    <div className={styles.intro} aria-label="小助手使用引导">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-violet-700">
          认识小助手 · {step + 1} / {steps.length}
        </p>
        <button
          type="button"
          onClick={onFinish}
          aria-label="关闭使用引导"
          className="flex size-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 flex items-start gap-3">
        <div className="shrink-0 rounded-full border border-violet-100 bg-white p-1 shadow-sm">
          <TeacherAssistantMascot greeting />
        </div>
        <div>
          <h3
            ref={heading}
            tabIndex={-1}
            className="font-semibold text-slate-950"
          >
            {steps[step].title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {steps[step].detail}
          </p>
        </div>
      </div>
      <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
        {steps[step].example}
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onFinish}
          className="min-h-10 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          跳过引导
        </button>
        <button
          type="button"
          onClick={() =>
            step === steps.length - 1 ? onFinish() : setStep(step + 1)
          }
          className="min-h-10 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"
        >
          {step === steps.length - 1 ? "开始提问" : "下一步"}
        </button>
      </div>
    </div>
  );
}
