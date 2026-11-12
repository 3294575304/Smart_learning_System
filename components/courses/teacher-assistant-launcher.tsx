"use client";

import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  RotateCcw,
  X,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { TeacherAssistantConversation } from "./teacher-assistant-conversation";
import { TeacherAssistantIntro } from "./teacher-assistant-intro";
import { TeacherAssistantMascot } from "./teacher-assistant-mascot";
import { ASSISTANT_SIZE, useAssistantPosition } from "./use-assistant-position";
import {
  assistantCatalog,
  assistantTopics,
  type AssistantTopic,
} from "@/services/course-analytics/teacher-assistant-catalog";

type Course = { id: string; name: string; courseNo: string; term: string };
const introKey = "zhixue:teacher-assistant:intro:v1";

const pageTopics = assistantTopics
  .filter((topic) => topic !== "BOTH")
  .sort(
    (a, b) => assistantCatalog[b].path.length - assistantCatalog[a].path.length,
  );

function currentArea(pathname: string): AssistantTopic {
  return (
    pageTopics.find((topic) => {
      const { path, course } = assistantCatalog[topic];
      const area = course
        ? pathname.replace(/^\/teacher\/courses\/[^/]+/u, "")
        : pathname;
      return (
        area === path || (topic !== "WORKBENCH" && area.startsWith(`${path}/`))
      );
    }) ?? "WORKBENCH"
  );
}

export function TeacherAssistantLauncher({ courses }: { courses: Course[] }) {
  const pathname = usePathname();
  const query = useSearchParams();
  const currentId =
    /^\/teacher\/courses\/([^/]+)/u.exec(pathname)?.[1] ??
    query.get("courseId");
  const rawClassroomId =
    query.get("classroomId") ??
    /^\/teacher\/classrooms\/([^/]+)/u.exec(pathname)?.[1];
  const classroomId =
    rawClassroomId && /^c[^\s-]{8,}$/iu.test(rawClassroomId)
      ? rawClassroomId
      : undefined;
  const currentCourse = courses.find((course) => course.id === currentId);
  return (
    <AssistantPanel
      key={`${pathname}:${currentCourse?.id ?? ""}:${classroomId ?? ""}`}
      currentCourse={currentCourse}
      classroomId={classroomId}
      area={currentArea(pathname)}
    />
  );
}

function AssistantPanel({
  currentCourse,
  classroomId,
  area,
}: {
  currentCourse?: Course;
  classroomId?: string;
  area: AssistantTopic;
}) {
  const panelId = useId();
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState(false);
  const [panelHeight, setPanelHeight] = useState(480);
  const seenIntro = useRef(false);
  const position = useAssistantPosition();

  function finishIntro() {
    seenIntro.current = true;
    try {
      localStorage.setItem(introKey, "done");
    } catch {
      /* Session-only dismissal remains available. */
    }
    setIntro(false);
  }

  function close() {
    if (intro) finishIntro();
    setOpen(false);
    trigger.current?.focus();
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    let completed = seenIntro.current;
    try {
      completed ||= localStorage.getItem(introKey) === "done";
    } catch {
      /* Show the guide on first use. */
    }
    setIntro(!completed);
    setOpen(true);
  }

  useEffect(() => {
    if (!open || !panel.current) return;
    const measure = () =>
      setPanelHeight(panel.current?.getBoundingClientRect().height ?? 480);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (open && !intro)
      panel.current
        ?.querySelector<HTMLTextAreaElement>("[data-teacher-assistant-input]")
        ?.focus();
  }, [open, intro]);

  if (!position.layout) return null;
  const { position: point, viewport } = position.layout;
  const dock = open ? null : position.dock;
  const tabWidth = 28;
  const triggerX =
    dock === "left"
      ? viewport.left
      : dock === "right"
        ? viewport.left + viewport.width - tabWidth
        : point.x;
  const panelWidth = Math.min(400, Math.max(0, viewport.width - 24));
  const fitsRight =
    point.x + ASSISTANT_SIZE + 12 + panelWidth <=
    viewport.left + viewport.width - 12;
  const fitsLeft = point.x - panelWidth - 12 >= viewport.left + 12;
  const stacked = !fitsRight && !fitsLeft;
  const above = Math.max(0, point.y - viewport.top - 24);
  const below = Math.max(
    0,
    viewport.top + viewport.height - point.y - ASSISTANT_SIZE - 24,
  );
  const maxHeight = Math.max(
    64,
    stacked ? Math.max(above, below) : viewport.height - 24,
  );
  const visibleHeight = Math.min(panelHeight, maxHeight);
  const idealLeft = fitsRight
    ? point.x + ASSISTANT_SIZE + 12
    : point.x - panelWidth - 12;
  const left = Math.max(
    viewport.left + 12,
    Math.min(idealLeft, viewport.left + viewport.width - panelWidth - 12),
  );
  const top = Math.max(
    viewport.top + 12,
    Math.min(
      stacked
        ? above >= below
          ? point.y - visibleHeight - 12
          : point.y + ASSISTANT_SIZE + 12
        : point.y + ASSISTANT_SIZE / 2 - visibleHeight / 2,
      viewport.top + viewport.height - visibleHeight - 12,
    ),
  );
  return (
    <>
      <div
        className="fixed top-0 left-0 z-40"
        style={{
          transform: `translate3d(${triggerX}px, ${point.y}px, 0)`,
          width: dock ? tabWidth : ASSISTANT_SIZE,
          height: ASSISTANT_SIZE,
        }}
      >
        <button
          type="button"
          ref={trigger}
          data-teacher-assistant-mascot
          data-dragging={position.dragging || undefined}
          aria-label="教师 AI 助手"
          aria-expanded={open}
          aria-controls={panelId}
          aria-describedby={`${panelId}-movement`}
          title={
            dock
              ? "展开教师 AI 助手，也可拖出边缘"
              : "教师 AI 助手 · 点击提问，拖动换位置"
          }
          className={`flex h-full w-full touch-none items-center justify-center border bg-white shadow-[0_5px_14px_#40305416] select-none focus-visible:outline-2 focus-visible:outline-violet-700 ${dock ? `cursor-pointer bg-violet-50 text-violet-800 hover:bg-violet-100 focus-visible:-outline-offset-2 ${dock === "left" ? "rounded-e-xl border-s-0" : "rounded-s-xl border-e-0"}` : `rounded-full p-[3px] focus-visible:outline-offset-2 ${position.dragging ? "cursor-grabbing border-violet-500 shadow-lg ring-4 ring-violet-200" : "cursor-grab border-[#e5deef] hover:bg-violet-50"}`}`}
          onPointerDown={position.onPointerDown}
          onPointerMove={position.onPointerMove}
          onPointerUp={(event) => {
            if (position.onPointerUp(event)) toggle();
          }}
          onPointerCancel={position.onPointerCancel}
          onLostPointerCapture={position.onLostPointerCapture}
          onClick={(event) => {
            if (!position.consumeClick(event.detail)) toggle();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              event.stopPropagation();
              close();
            } else position.onKeyDown(event);
          }}
        >
          {dock ? (
            <span className="flex flex-col items-center gap-0.5">
              {dock === "left" ? (
                <ChevronRight className="size-3.5" aria-hidden="true" />
              ) : (
                <ChevronLeft className="size-3.5" aria-hidden="true" />
              )}
              <span aria-hidden="true" className="text-[10px] font-semibold">
                AI
              </span>
            </span>
          ) : (
            <TeacherAssistantMascot greeting={open && intro} />
          )}
        </button>
      </div>
      <span id={`${panelId}-movement`} className="sr-only">
        点击打开或收起助手，拖到左右边缘可收成标签。聚焦后可用方向键移动，按
        Shift 加快移动。
      </span>
      <div role="status" className="sr-only">
        {position.status}
      </div>
      {open ? (
        <section
          id={panelId}
          ref={panel}
          aria-label="教师 AI 助手面板"
          style={{
            left,
            top,
            width: panelWidth,
            maxHeight,
          }}
          className="fixed z-40 overflow-y-auto overscroll-contain rounded-2xl border border-violet-100 bg-white p-4 shadow-xl"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-950">教师 AI 助手</h2>
              <p className="mt-1 text-sm text-slate-600">
                想找页面、办事项，还是排查问题？直接告诉我。
              </p>
            </div>
            <button
              type="button"
              aria-label="收起教师 AI 助手"
              onClick={close}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          {intro ? <TeacherAssistantIntro onFinish={finishIntro} /> : null}
          <div hidden={intro}>
            <TeacherAssistantConversation
              courseId={currentCourse?.id}
              courseName={currentCourse?.name}
              classroomId={classroomId}
              area={area}
              onNavigate={close}
            />
          </div>
          {!intro ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => setIntro(true)}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-slate-600 hover:bg-slate-100"
              >
                <CircleHelp className="size-3.5" aria-hidden="true" />
                使用引导
              </button>
              <button
                type="button"
                onClick={position.reset}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-slate-600 hover:bg-slate-100"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                重置悬浮位置
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
