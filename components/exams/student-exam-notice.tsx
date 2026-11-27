"use client";

import { ChevronRight, ClipboardList } from "lucide-react";
import { useId, useRef, useState } from "react";
import { EditorDialog } from "@/components/assignments/editor-dialog";
import { examWindowBlurThresholdMs } from "@/services/exams/switch-policy";

const examTime = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export function StudentExamNotice({
  title,
  start,
  end,
  allowedAttempts,
  allowedSwitches,
  autoSubmitOnExit,
}: {
  title: string;
  start: string;
  end: string;
  allowedAttempts: number;
  allowedSwitches: number;
  autoSubmitOnExit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const minutes = Math.max(
    0,
    Math.round((Date.parse(end) - Date.parse(start)) / 60_000),
  );
  return (
    <div className="mt-3">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
        className="group flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-start text-sm font-semibold text-sky-900 transition-colors hover:border-sky-400 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:bg-sky-200"
      >
        <ClipboardList
          className="size-4 shrink-0 text-sky-700"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">本场考试须知</span>
        <ChevronRight
          className="size-4 shrink-0 text-sky-700 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </button>
      <EditorDialog
        open={open}
        title="本场考试须知"
        dialogId={id}
        showCloseButton
        onClose={() => setOpen(false)}
        onAfterClose={() => trigger.current?.focus({ preventScroll: true })}
      >
        <p className="mt-2 text-sm font-medium [overflow-wrap:anywhere] text-slate-700">
          {title}
        </p>
        <dl className="mt-4 grid gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-600">开考时间（北京时间）</dt>
            <dd className="mt-1 font-semibold">
              <time dateTime={start}>{examTime.format(new Date(start))}</time>
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">交卷截止（北京时间）</dt>
            <dd className="mt-1 font-semibold">
              <time dateTime={end}>{examTime.format(new Date(end))}</time>
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">考试时段</dt>
            <dd className="mt-1 font-semibold">
              {minutes > 0 ? `约 ${minutes} 分钟` : "不足 1 分钟"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">可考次数</dt>
            <dd className="mt-1 font-semibold">{allowedAttempts} 次</dd>
          </div>
        </dl>
        <section className="mt-5 space-y-2 text-sm leading-6 text-slate-700">
          <h3 className="font-semibold text-slate-900">切屏与交卷规则</h3>
          <ul className="list-disc space-y-1 ps-5">
            <li>
              允许切屏 {allowedSwitches}{" "}
              次，超过上限自动交卷。切换标签页，或切到其他窗口导致持续失焦约{" "}
              {examWindowBlurThresholdMs / 1000} 秒，都会计入切屏。
            </li>
            <li>
              {autoSubmitOnExit
                ? "离开作答页会自动交卷。"
                : "退出后会保留已保存的作答，可在截止前继续。"}
            </li>
            <li>
              到达截止时间自动收卷，以系统收到的答案为准。考试范围以任课教师公布为准。
            </li>
          </ul>
        </section>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className="min-h-11 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:bg-sky-900"
            onClick={() => setOpen(false)}
          >
            我知道了
          </button>
        </div>
      </EditorDialog>
    </div>
  );
}
