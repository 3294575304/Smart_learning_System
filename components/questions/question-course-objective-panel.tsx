"use client";

import { useState } from "react";
import { QuestionObjectiveRetry } from "./question-objective-retry";

type Course = {
  courseId: string;
  name: string;
  term: string;
  syllabusStructureId: string;
  versionNumber: number;
  objectives: Array<{ code: string; title: string }>;
  objectiveCodes: string[];
  aiObjectiveCodes: string[];
};

export function QuestionCourseObjectivePanel({
  questionId,
  courses,
}: {
  questionId: string;
  courses: Course[];
}) {
  const [items, setItems] = useState(courses);
  const [selected, setSelected] = useState(courses[0]?.courseId ?? "");
  const [value, setValue] = useState(courses[0]?.objectiveCodes ?? []);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  if (!courses.length) return null;
  const course = items.find(({ courseId }) => courseId === selected);
  const changed =
    JSON.stringify(value) !== JSON.stringify(course?.objectiveCodes);
  const hasAiLabel = Boolean(course?.aiObjectiveCodes.length);
  async function save() {
    if (!course || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch(
        `/api/teacher/questions/${encodeURIComponent(questionId)}/course-objective`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            courseId: course.courseId,
            syllabusStructureId: course.syllabusStructureId,
            objectiveCodes: value,
            expectedObjectiveCodes: course.objectiveCodes,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok || !body.success)
        throw new Error(body.error ?? "保存失败");
      setItems((current) =>
        current.map((item) =>
          item.courseId === course.courseId
            ? { ...item, objectiveCodes: value, aiObjectiveCodes: [] }
            : item,
        ),
      );
      setFeedback("课程目标已保存");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">课程目标</h2>
      <p className="text-sm text-gray-600">
        共享题目在每门课程可关联不同的正式大纲目标；更换大纲版本后需要重新分类。
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          课程
          <select
            className="mt-1 block rounded border p-2"
            value={selected}
            disabled={busy}
            onChange={(event) => {
              const next = items.find(
                (item) => item.courseId === event.target.value,
              );
              setSelected(event.target.value);
              setValue(next?.objectiveCodes ?? []);
              setFeedback("");
            }}
          >
            {items.map((item) => (
              <option key={item.courseId} value={item.courseId}>
                {item.name} · {item.term} · 大纲 v{item.versionNumber}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-1 text-sm">
          <legend>最多选择 3 个目标</legend>
          {course?.objectives.map((objective) => (
            <label
              key={objective.code}
              className="flex items-center gap-2 rounded border px-2 py-1"
            >
              <input
                type="checkbox"
                checked={value.includes(objective.code)}
                disabled={
                  busy || (value.length >= 3 && !value.includes(objective.code))
                }
                onChange={(event) => {
                  setValue((current) =>
                    event.target.checked
                      ? [...current, objective.code].sort()
                      : current.filter((code) => code !== objective.code),
                  );
                }}
              />
              {objective.code} · {objective.title}
              {course?.aiObjectiveCodes.includes(objective.code) && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                  AI 标注
                </span>
              )}
            </label>
          ))}
        </fieldset>
        <button
          className="self-end rounded bg-sky-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy || (!changed && !hasAiLabel)}
          onClick={() => void save()}
          type="button"
        >
          {busy
            ? "保存中…"
            : !changed && hasAiLabel
              ? "确认当前标注"
              : "保存目标"}
        </button>
      </div>
      {course &&
        !busy &&
        !changed &&
        course.aiObjectiveCodes.length === 1 &&
        course.objectiveCodes.length === 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <QuestionObjectiveRetry
              key={course.courseId}
              questionId={questionId}
              courseId={course.courseId}
              reclassify
            />
            <span>仅重判当前 AI 标签。确认后转为教师标注。</span>
          </div>
        )}
      {feedback ? (
        <p aria-live="polite" className="text-sm">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
