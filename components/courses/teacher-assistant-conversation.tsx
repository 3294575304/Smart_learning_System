"use client";

import Link from "next/link";
import { ArrowUpRight, Send } from "lucide-react";
import { useId, useRef, useState } from "react";
import { requestApi } from "@/components/courses/request-api";
import {
  assistantCatalog,
  assistantStarters,
  type AssistantTopic,
} from "@/services/course-analytics/teacher-assistant-catalog";
import type {
  TeacherAssistantRequest,
  TeacherAssistantResult,
} from "@/services/course-analytics/teacher-assistant-schemas";
import type {
  EvaluationAssistantRequest,
  EvaluationAssistantResult,
} from "@/services/course-analytics/evaluation-assistant-schemas";

const control =
  "w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900";
const button =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-800 hover:bg-violet-50 disabled:opacity-50";
const primary =
  "inline-flex min-h-10 items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50";

export function TeacherAssistantConversation({
  courseId,
  courseName,
  classroomId,
  area,
  onNavigate,
}: {
  courseId?: string;
  courseName?: string;
  classroomId?: string;
  area?: AssistantTopic;
  onNavigate: () => void;
}) {
  const questionId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<TeacherAssistantResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [courseChoice, setCourseChoice] = useState("");
  const [rememberedCourseId, setRememberedCourseId] = useState(courseId);
  const [classChoice, setClassChoice] = useState("");
  const [announcement, setAnnouncement] = useState("");

  async function plan(
    input: Pick<TeacherAssistantRequest, "text" | "topic" | "selectedCourseId">,
  ) {
    if (busy) return;
    if (!input.text.trim()) {
      setInvalid(true);
      setError("输入你想找的功能或遇到的问题。");
      field.current?.focus();
      return;
    }
    setError("");
    setInvalid(false);
    setBusy(true);
    setAnnouncement("正在查找合适的入口。");
    try {
      const result = await requestApi<TeacherAssistantResult>(
        "/api/teacher/assistant",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            area,
            courseId: rememberedCourseId,
            classroomId:
              rememberedCourseId === courseId ? classroomId : undefined,
            previousTopic: reply?.topic,
          }),
        },
      );
      if (!result.success) {
        setError(result.error);
        setAnnouncement("");
        return;
      }
      setQuestion(input.text);
      setDraft("");
      setCourseChoice("");
      setClassChoice("");
      setReply(result.data);
      const resolvedCourse =
        result.data.evaluation?.courseId ?? input.selectedCourseId;
      if (resolvedCourse) setRememberedCourseId(resolvedCourse);
      setAnnouncement(result.data.message);
    } finally {
      setBusy(false);
    }
  }

  async function continueEvaluation(input: EvaluationAssistantRequest) {
    const evaluation = reply?.evaluation;
    if (busy || !evaluation) return;
    setBusy(true);
    setError("");
    setAnnouncement("正在核对课程和教学班状态。");
    try {
      const result = await requestApi<EvaluationAssistantResult>(
        `/api/teacher/courses/${encodeURIComponent(evaluation.courseId)}/evaluation-assistant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!result.success) {
        setAnnouncement("");
        setError(result.error);
        if (result.status === 409 && reply)
          setReply({
            ...reply,
            evaluation: undefined,
            topics: reply.topic ? [reply.topic] : undefined,
          });
        return;
      }
      const state = result.data;
      if (state.status === "CONFIRMED") {
        onNavigate();
        window.location.assign(state.href);
      } else if (
        state.status === "REVIEW" ||
        state.status === "CHOOSE_CLASSROOM"
      ) {
        setReply({
          ...reply,
          message: "我找到了这个事项的下一步。",
          evaluation: { courseId: evaluation.courseId, state },
        });
        setAnnouncement("已找到下一步。");
      } else {
        setReply({
          ...reply,
          message: state.message,
          evaluation: undefined,
          cards: [
            {
              label: "查看课程教学班",
              href: `/teacher/courses/${encodeURIComponent(evaluation.courseId)}/classrooms`,
              detail: "核对教学班的关联和授课状态。",
            },
          ],
        });
        setAnnouncement(state.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const state = reply?.evaluation?.state;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="试着问我">
        {assistantStarters.map((starter) => (
          <button
            key={starter.label}
            type="button"
            className={button}
            disabled={busy}
            onClick={() => void plan({ text: starter.text })}
          >
            {starter.label}
          </button>
        ))}
      </div>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void plan({ text: draft });
        }}
      >
        <label
          className="block text-sm font-semibold text-slate-900"
          htmlFor={questionId}
        >
          你想做什么？
        </label>
        <textarea
          ref={field}
          id={questionId}
          name="question"
          className={control}
          data-teacher-assistant-input
          rows={2}
          maxLength={240}
          value={draft}
          disabled={busy}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${questionId}-error` : undefined}
          placeholder="例如，为什么学生看不到作业？"
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
            setError("");
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            {courseName
              ? `当前页面 · ${courseName}`
              : "可直接提问，需要时再选课程。"}
          </p>
          <button className={primary} disabled={busy} type="submit">
            <Send className="size-4" aria-hidden="true" />
            {busy ? "正在查找" : "发送问题"}
          </button>
        </div>
      </form>
      <div role="status" className="sr-only">
        {announcement}
      </div>
      {error ? (
        <p
          id={`${questionId}-error`}
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {reply ? (
        <section
          aria-label="助手回复"
          className="space-y-3 border-t border-slate-200 pt-3 text-sm text-slate-700"
        >
          <p className="ml-6 rounded-xl bg-violet-50 px-3 py-2 break-words text-violet-950">
            {question}
          </p>
          <p>{reply.message}</p>
          {reply.cards?.map((card) => (
            <Link
              href={card.href}
              key={card.href}
              onNavigate={onNavigate}
              className="block rounded-xl border border-violet-200 bg-white px-3 py-2.5 hover:bg-violet-50"
            >
              <span className="flex items-center justify-between gap-2 font-semibold text-violet-800">
                {card.label}
                <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
              </span>
              <span className="mt-1 block leading-5">{card.detail}</span>
            </Link>
          ))}
          {reply.topics?.length ? (
            <div className="flex flex-wrap gap-2">
              {reply.topics.map((topic) => (
                <button
                  key={topic}
                  className={button}
                  disabled={busy}
                  type="button"
                  onClick={() => void plan({ text: question, topic })}
                >
                  选择{assistantCatalog[topic].label}
                </button>
              ))}
            </div>
          ) : null}
          {reply.courses ? (
            <div className="space-y-2">
              <label
                htmlFor={`${questionId}-course`}
                className="block font-medium"
              >
                课程
              </label>
              <select
                id={`${questionId}-course`}
                className={control}
                value={courseChoice}
                disabled={busy}
                onChange={(event) => setCourseChoice(event.target.value)}
              >
                <option value="">选择课程</option>
                {reply.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} · {course.courseNo} · {course.term}
                  </option>
                ))}
              </select>
              <button
                className={button}
                type="button"
                disabled={busy || !courseChoice}
                onClick={() =>
                  void plan({
                    text: question,
                    topic: reply.topic,
                    selectedCourseId: courseChoice,
                  })
                }
              >
                查看课程下一步
              </button>
            </div>
          ) : null}
          {state?.status === "CHOOSE_CLASSROOM" ? (
            <div className="space-y-2">
              <label
                htmlFor={`${questionId}-classroom`}
                className="block font-medium"
              >
                教学班
              </label>
              <select
                id={`${questionId}-classroom`}
                className={control}
                value={classChoice}
                disabled={busy}
                onChange={(event) => setClassChoice(event.target.value)}
              >
                <option value="">选择教学班</option>
                {state.classrooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                    {state.classrooms.some(
                      (other) =>
                        other.id !== room.id && other.name === room.name,
                    )
                      ? ` · 编号 ${room.id.slice(-6)}`
                      : ""}
                  </option>
                ))}
              </select>
              <button
                className={button}
                type="button"
                disabled={busy || !classChoice}
                onClick={() =>
                  void continueEvaluation({
                    action: "select",
                    intent: state.intent,
                    classroomId: classChoice,
                  })
                }
              >
                查看班级下一步
              </button>
            </div>
          ) : null}
          {state?.status === "REVIEW" ? (
            <div className="space-y-2 rounded-xl border border-violet-200 bg-white p-3">
              <p className="font-semibold text-slate-900">
                {state.courseName}
                {state.classroom ? ` · ${state.classroom.name}` : ""}
              </p>
              {state.publicationVersion !== null ? (
                <p className="text-xs">
                  正式成绩版本 v{state.publicationVersion}
                </p>
              ) : null}
              <p>{state.detail}</p>
              <button
                className={primary}
                type="button"
                disabled={busy}
                onClick={() =>
                  void continueEvaluation({
                    action: "confirm",
                    intent: state.intent,
                    classroomId: state.classroom?.id,
                    revision: state.revision,
                  })
                }
              >
                {state.label}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
