"use client";

import { CircleHelp, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EditorDialog } from "@/components/assignments/editor-dialog";
import { requestApi } from "@/components/courses/request-api";
import { StudentPageLink } from "@/components/dashboard/student-page-link";
import { studentTaskDate } from "@/services/dashboard/student-task-overview";
import type { StudyAssistantReply } from "@/services/student-assistant/rules";
import { useStudentAssistantAvailability } from "./use-availability";

const pages = new Set([
  "/student",
  "/student/courses",
  "/student/tasks",
  "/student/assignments",
  "/student/exams",
  "/student/attendance",
  "/student/surveys",
  "/student/recommendations",
  "/student/wrong-questions",
  "/student/course-grades",
  "/student/analytics",
]);
const buttonStyle =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sky-200 px-3 text-sm font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50";

export function StudyAssistantLauncher() {
  const pathname = usePathname();
  const available = useStudentAssistantAvailability(pages.has(pathname));
  return available ? <Assistant key={pathname} /> : null;
}

function Assistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<StudyAssistantReply>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function close() {
    active.current?.abort();
    active.current = null;
    setPending(false);
    setReply(undefined);
    setError("");
    setText("");
    setOpen(false);
  }

  async function ask(action: "find" | "today", query = text) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setReply(undefined);
    setError("");
    const result = await requestApi<StudyAssistantReply>(
      "/api/student/study-assistant",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "today" ? { action } : { action, text: query },
        ),
        signal: controller.signal,
      },
    );
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    if (result.success) setReply(result.data);
    else if (result.code === "EXAM_IN_PROGRESS") close();
    else setError(result.error);
  }

  return (
    <>
      <button
        type="button"
        aria-label="学习助手"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-white/90 text-sky-800 shadow-sm hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        title="学习助手"
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="size-5" aria-hidden="true" />
      </button>
      <EditorDialog
        open={open}
        title="学习助手"
        onClose={close}
        showCloseButton
      >
        <p className="mt-1 text-sm text-slate-600">
          查找学习功能，或查看今天截止的任务。
        </p>
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) void ask("find");
          }}
        >
          <input
            aria-label="输入功能名称"
            placeholder="例如：作业、成绩、错题"
            className="min-h-10 min-w-0 flex-1 basis-36 rounded-lg border border-sky-200 px-3 text-sm focus-visible:outline-2 focus-visible:outline-sky-700"
            maxLength={120}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button
            type="submit"
            disabled={!text.trim() || pending}
            className={buttonStyle}
          >
            <Search aria-hidden="true" className="size-4" />
            找功能
          </button>
        </form>
        <button
          type="button"
          className={`${buttonStyle} mt-2`}
          disabled={pending}
          onClick={() => void ask("today")}
        >
          今天待办
        </button>
        <div className="mt-4 space-y-2" aria-busy={pending}>
          {pending && (
            <p role="status" className="text-sm text-slate-600">
              正在查询…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          {reply?.kind === "navigation" && (
            <>
              <p role="status" className="text-sm text-slate-600">
                {reply.message}
              </p>
              <ul className="flex flex-wrap gap-2">
                {reply.links.map((link) => (
                  <li key={link.href}>
                    <StudentPageLink href={link.href} className={buttonStyle}>
                      {link.label}
                    </StudentPageLink>
                  </li>
                ))}
              </ul>
            </>
          )}
          {reply?.kind === "today" && (
            <>
              <p role="status" className="text-sm font-medium">
                {reply.total
                  ? `今天有 ${reply.total} 项任务截止`
                  : "今天没有待处理的截止事项"}
              </p>
              {reply.items.length > 0 && (
                <ul className="divide-y divide-sky-100">
                  {reply.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3"
                    >
                      <div className="min-w-0 flex-1 basis-36 break-words">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-slate-600">
                          {[
                            item.courseName,
                            item.classroomName,
                            studentTaskDate(new Date(item.dueAt)),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <StudentPageLink href={item.href} className={buttonStyle}>
                        {item.action}
                      </StudentPageLink>
                    </li>
                  ))}
                </ul>
              )}
              <StudentPageLink href="/student/tasks" className={buttonStyle}>
                查看全部任务
              </StudentPageLink>
            </>
          )}
        </div>
      </EditorDialog>
    </>
  );
}
