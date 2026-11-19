"use client";

import {
  ChevronLeft,
  ChevronRight,
  PanelRight,
  PanelRightClose,
} from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { StatusChip } from "@/components/ui/status-chip";
import { AnswerSheetPanel } from "./answer-sheet-panel";
import { EditorDialog } from "./editor-dialog";

const answerButton =
  "focus-visible:outline-brand inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
export const answerSecondaryButton = `${answerButton} border border-line bg-card text-brand-strong hover:bg-sky-50`;
export const answerPrimaryButton = `${answerButton} bg-brand text-white hover:bg-brand-strong`;
export const answerQuestionCard =
  "border-line bg-card min-w-0 scroll-mt-[calc(var(--dashboard-header-height,4rem)+1rem)] rounded-xl border p-4 shadow-[var(--shadow-card)] sm:p-6";

type Navigator = Omit<
  ComponentProps<typeof AnswerSheetPanel>,
  "className" | "showTitle" | "footer"
>;
type WorkspaceHeader = {
  title: string;
  details: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
};

export function StudentAnswerWorkspace({
  header,
  navigator,
  busy,
  children,
  firstUnanswered,
}: {
  header: WorkspaceHeader;
  navigator: Navigator;
  busy?: boolean;
  children: ReactNode;
  firstUnanswered?: number;
}) {
  const [open, setOpen] = useState(false);
  const selection = useRef<number | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const Icon = open ? PanelRightClose : PanelRight;

  return (
    <div className="min-w-0 space-y-4">
      <header className="border-line bg-card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-4 py-3 sm:px-5">
        {header.leading}
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="text-ink text-lg leading-7 font-semibold [overflow-wrap:anywhere]">
            {header.title}
          </h1>
          <div className="text-ink-soft mt-0.5 text-xs leading-5 tabular-nums">
            {header.details}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {header.actions}
          {navigator.questions.length > 0 && (
            <button
              ref={toggleRef}
              type="button"
              aria-controls={drawerId}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={answerSecondaryButton}
              disabled={busy}
              onClick={() => setOpen(true)}
            >
              <Icon aria-hidden="true" className="size-4" />
              展开答题卡
            </button>
          )}
        </div>
        {header.status}
      </header>

      <div className="min-w-0 space-y-4" inert={busy}>
        {children}
      </div>

      <EditorDialog
        open={open}
        title="答题卡"
        placement="right"
        dialogId={drawerId}
        showCloseButton
        onClose={() => setOpen(false)}
        onAfterClose={() => {
          const index = selection.current;
          selection.current = null;
          if (index === null) toggleRef.current?.focus({ preventScroll: true });
          else navigator.onSelect(index);
        }}
      >
        {open && (
          <AnswerSheetPanel
            {...navigator}
            className="mt-4 border-0 bg-transparent p-0 shadow-none"
            showTitle={false}
            onSelect={(index) => {
              selection.current = index;
              setOpen(false);
            }}
            footer={
              firstUnanswered !== undefined && firstUnanswered >= 0 ? (
                <button
                  type="button"
                  className={answerSecondaryButton}
                  disabled={navigator.disabled}
                  onClick={() => {
                    selection.current = firstUnanswered;
                    setOpen(false);
                  }}
                >
                  跳到第一道未答题
                </button>
              ) : undefined
            }
          />
        )}
      </EditorDialog>
    </div>
  );
}

export function StudentAnswerFooter({
  current,
  total,
  disabled,
  onSelect,
  actions,
  note,
}: {
  current: number;
  total: number;
  disabled?: boolean;
  onSelect: (index: number) => void;
  actions?: ReactNode;
  note?: string;
}) {
  if (total < 2 && !actions && !note) return null;
  return (
    <footer className="border-line bg-card rounded-xl border p-3 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {total > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              className={answerSecondaryButton}
              disabled={disabled || current <= 0}
              onClick={() => onSelect(current - 1)}
              type="button"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              上一题
            </button>
            <button
              className={answerSecondaryButton}
              disabled={disabled || current >= total - 1}
              onClick={() => onSelect(current + 1)}
              type="button"
            >
              下一题
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
        {actions && (
          <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
            {actions}
          </div>
        )}
      </div>
      {note && (
        <p className="text-ink-soft mt-2 text-xs sm:text-right">{note}</p>
      )}
    </footer>
  );
}

export function AnswerQuestionHeading({
  title,
  type,
  points,
  detail,
  actions,
}: {
  title: string;
  type?: string;
  points?: number | null;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-48">
        <div className="text-ink-soft flex flex-wrap items-center gap-2 text-xs leading-5">
          {type && <StatusChip tone="neutral">{type}</StatusChip>}
          {points != null && (
            <span className="font-medium tabular-nums">{points} 分</span>
          )}
          {detail}
        </div>
        <h2 className="text-ink mt-1 text-lg leading-7 font-semibold [overflow-wrap:anywhere] sm:text-xl">
          {title}
        </h2>
      </div>
      {actions}
    </header>
  );
}

export function ProgrammingAnswerLayout({
  prompt,
  children,
}: {
  prompt: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-line-soft @container mt-4 min-w-0 border-t pt-4">
      <div className="grid min-w-0 items-stretch gap-4 @min-[45rem]:h-[40rem] @min-[45rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @min-[45rem]:grid-rows-[minmax(0,1fr)]">
        <section
          aria-label="题目说明"
          tabIndex={0}
          className="border-line bg-page focus-visible:outline-brand min-w-0 rounded-xl border p-4 focus-visible:outline-2 @min-[45rem]:col-start-2 @min-[45rem]:row-start-1 @min-[45rem]:h-full @min-[45rem]:overflow-auto @min-[45rem]:overscroll-contain"
        >
          <h3 className="text-ink mb-3 text-sm font-semibold">题目说明</h3>
          {prompt}
        </section>
        <div className="min-w-0 @min-[45rem]:col-start-1 @min-[45rem]:row-start-1 @min-[45rem]:h-full @min-[45rem]:min-h-0 @min-[45rem]:overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
