"use client";

import { PanelRight } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { EditorDialog } from "./editor-dialog";
import {
  AnswerSheetPanel,
  type AnswerSheetQuestion,
  type AnswerSheetState,
} from "./answer-sheet-panel";

export interface AnswerCardQuestion extends AnswerSheetQuestion {
  /** 点击题号后滚动并聚焦的 DOM id */
  targetId: string;
  /** 该题在答题卡上的状态；缺省时按「无作答状态」处理 */
  state?: AnswerSheetState;
}

/**
 * 只读场景的答题卡（教师查看试卷、学生查看提交结果、教师批改）。
 *
 * 与作答页共用 `AnswerSheetPanel`：同样的题型分段、题号网格和图例，
 * 区别只在于状态来源由调用方给出，点击题号是「跳转」而不是「切换作答题」。
 *
 * 只要试卷里有题目就渲染入口，不区分作业类别——平时表现、课程作业、
 * 课程实验、考试场次的题目型作业使用同一套答题卡。
 */
export function ReadOnlyAnswerCard({
  questions,
  triggerLabel = "答题卡",
  totalPoints,
  progress = null,
  legendItems,
  summary,
  plainNumbers = false,
}: {
  questions: AnswerCardQuestion[];
  triggerLabel?: string;
  totalPoints?: number;
  /** 没有可信完成度时传 null，隐藏进度条，避免「0 / N」误导 */
  progress?: { label: string; answeredCount: number } | null;
  legendItems?: readonly AnswerSheetState[];
  summary?: ReactNode;
  plainNumbers?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const jumpTarget = useRef<string | null>(null);
  if (questions.length === 0) return null;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-controls={open ? dialogId : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="border-line bg-card text-brand-strong hover:bg-brand-soft focus-visible:outline-brand fixed top-[38%] right-0 z-40 inline-flex w-9 -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 py-3 text-xs font-medium shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <PanelRight className="size-4" aria-hidden="true" />
        <span className="leading-5 tracking-widest [writing-mode:vertical-rl]">
          {triggerLabel}
        </span>
      </button>
      <EditorDialog
        open={open}
        title="答题卡"
        placement="right"
        dialogId={dialogId}
        showCloseButton
        onClose={() => setOpen(false)}
        onAfterClose={() => {
          const target = jumpTarget.current
            ? document.getElementById(jumpTarget.current)
            : null;
          jumpTarget.current = null;
          if (target) {
            target.scrollIntoView({ block: "start" });
            target.focus({ preventScroll: true });
          } else {
            trigger.current?.focus({ preventScroll: true });
          }
        }}
      >
        {open && (
          <AnswerSheetPanel
            activeIndex={-1}
            answeredCount={progress?.answeredCount ?? questions.length}
            className="mt-4 border-0 bg-transparent p-0 shadow-none"
            groupByType
            legendItems={legendItems ?? []}
            onSelect={(index) => {
              jumpTarget.current = questions[index]?.targetId ?? null;
              setOpen(false);
            }}
            plainNumbers={plainNumbers}
            progressLabel={progress?.label}
            questionState={(index) => questions[index]?.state ?? { label: "题目", className: "" }}
            questions={questions}
            showProgress={Boolean(progress)}
            showTitle={false}
            summary={summary}
            totalPoints={totalPoints}
          />
        )}
      </EditorDialog>
    </>
  );
}
